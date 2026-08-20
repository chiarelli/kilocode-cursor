#!/usr/bin/env node

import { spawn } from 'child_process';

export interface MockCursorAgentOptions {
  responseDelay?: number;
  errorOnNthCall?: number;
  exitWithCode?: number;
  outputFormat?: 'json' | 'stream-json';
}

export class MockCursorAgent {
  private callCount = 0;
  private options: MockCursorAgentOptions;

  constructor(options: MockCursorAgentOptions = {}) {
    this.options = {
      responseDelay: 10,
      outputFormat: 'stream-json',
      ...options
    };
  }

  private createResponse(prompt: string): any[] {
    this.callCount++;
    const sessionId = `test-session-${this.callCount}`;
    const baseTimestamp = Date.now();
    
    const responses: any[] = [
      {
        type: "system",
        subtype: "init",
        timestamp: baseTimestamp,
        session_id: sessionId,
        cwd: process.cwd(),
        model: "cursor-agent",
        permissionMode: "default",
        tools: [
          { name: "read", description: "Read a file" }
        ]
      },
      {
        type: "user",
        timestamp: baseTimestamp + 100,
        session_id: sessionId,
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            }
          ]
        }
      }
    ];

    if (this.options.errorOnNthCall === this.callCount) {
      responses.push({
        type: "result",
        subtype: "error",
        timestamp: baseTimestamp + 200,
        session_id: sessionId,
        is_error: true,
        error: {
          message: "Mock error for testing",
          code: 500,
          details: "Test error triggered by mock configuration"
        }
      });
      return responses;
    }

    if (this.options.exitWithCode && this.options.exitWithCode > 0) {
      process.exitCode = this.options.exitWithCode;
      return responses;
    }

    const readMatch = prompt.match(/\bread\s+([^\s]+)/i);
    const readPath = readMatch?.[1];

    if (readPath) {
      responses.push(
        {
          type: "assistant",
          timestamp: baseTimestamp + 150,
          session_id: sessionId,
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Checking the file."
              }
            ]
          }
        },
        {
          type: "tool_call",
          subtype: "started",
          timestamp: baseTimestamp + 200,
          session_id: sessionId,
          call_id: `call_${this.callCount}`,
          tool_call: {
            readToolCall: {
              args: { path: readPath }
            }
          }
        },
        {
          type: "tool_call",
          subtype: "completed",
          timestamp: baseTimestamp + 240,
          session_id: sessionId,
          call_id: `call_${this.callCount}`,
          tool_call: {
            readToolCall: {
              result: {
                content: `Mock content for ${readPath}`,
                mimeType: "text/plain"
              }
            }
          }
        },
        {
          type: "assistant",
          timestamp: baseTimestamp + 300,
          session_id: sessionId,
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: `The file says: Mock content for ${readPath}`
              }
            ]
          }
        }
      );
    } else {
      responses.push({
        type: "assistant",
        timestamp: baseTimestamp + 150,
        session_id: sessionId,
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: `Response to: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`
            }
          ]
        }
      });
    }

    const defaultResponses = [
      {
        type: "result",
        subtype: "success",
        timestamp: baseTimestamp + 350,
        session_id: sessionId,
        is_error: false,
        duration_ms: 250
      }
    ];

    return responses.concat(defaultResponses);
  }

  public start(): void {
    process.stdin.setEncoding('utf8');
    
    let stdinBuffer = '';
    process.stdin.on('data', (chunk: Buffer | string) => {
      stdinBuffer += chunk.toString();
      
      const lines = stdinBuffer.split('\n');
      stdinBuffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          setTimeout(() => {
            try {
              const responses = this.createResponse(line.trim());
              
              responses.forEach(response => {
                if (this.options.outputFormat === 'stream-json') {
                  console.log(JSON.stringify(response));
                }
              });
            } catch (error) {
              console.error(JSON.stringify({
                type: "result",
                subtype: "error",
                timestamp: Date.now(),
                error: {
                  message: `Mock parsing error: ${error}`,
                  code: 400
                }
              }));
            }
          }, this.options.responseDelay);
        }
      }
    });

    process.stdin.on('end', () => {
      process.exit(this.options.exitWithCode || 0);
    });

    process.stdin.resume();
  }

  public static spawn(options: MockCursorAgentOptions = {}): ReturnType<typeof spawn> {
    const agent = new MockCursorAgent(options);
    
    const script = `
const { MockCursorAgent } = require(${JSON.stringify(__filename)});
const agent = new MockCursorAgent(${JSON.stringify(options)});
agent.start();
`;
    
    return spawn(process.execPath, ['-e', script], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }
}

if (require.main === module) {
  const agent = new MockCursorAgent();
  agent.start();
}
