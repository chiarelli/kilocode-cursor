// cmd/installer/utils.go
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"time"
)

// getConfigDir returns ~/.config for the actual user
func getConfigDir() (string, error) {
	if sudoUser := os.Getenv("SUDO_USER"); sudoUser != "" && sudoUser != "root" {
		u, err := user.Lookup(sudoUser)
		if err == nil {
			return filepath.Join(u.HomeDir, ".config"), nil
		}
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".config"), nil
}

// getActualUser returns the actual username (not root when using sudo)
func getActualUser() string {
	if sudoUser := os.Getenv("SUDO_USER"); sudoUser != "" && sudoUser != "root" {
		return sudoUser
	}
	if u, err := user.Current(); err == nil {
		return u.Username
	}
	return "unknown"
}

// detectExistingSetup checks if cursor-acp is already configured
func detectExistingSetup() (bool, string) {
	configDir, err := getConfigDir()
	if err != nil {
		return false, ""
	}

	configPath := filepath.Join(configDir, "opencode", "opencode.json")

	// Check for plugin symlink
	pluginDir := filepath.Join(configDir, "opencode", "plugin")
	symlinkPath := filepath.Join(pluginDir, "cursor-acp.js")
	if _, err := os.Lstat(symlinkPath); err == nil {
		return true, configPath
	}

	// Check config file
	data, err := os.ReadFile(configPath)
	if err != nil {
		return false, configPath
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return false, configPath
	}

	if providers, ok := config["provider"].(map[string]interface{}); ok {
		if _, exists := providers["cursor-acp"]; exists {
			return true, configPath
		}
	}

	return false, configPath
}

// commandExists checks if a command is available
func commandExists(cmd string) bool {
	_, err := exec.LookPath(cmd)
	return err == nil
}

// runCommand executes a command and logs output
func runCommand(name string, cmd *exec.Cmd, logFile *os.File) error {
	timestamp := time.Now().Format("15:04:05")
	cmdStr := cmd.String()

	if logFile != nil {
		logFile.WriteString(fmt.Sprintf("[%s] Running: %s\n", timestamp, cmdStr))
	}

	output, err := cmd.CombinedOutput()
	outputStr := string(output)

	if logFile != nil {
		if len(output) > 0 {
			logFile.Write(output)
			logFile.WriteString("\n")
		}
		if err != nil {
			logFile.WriteString(fmt.Sprintf("[%s] Error: %v\n\n", timestamp, err))
		} else {
			logFile.WriteString(fmt.Sprintf("[%s] Success\n\n", timestamp))
		}
		logFile.Sync()
	} else if err != nil {
		fmt.Fprintf(os.Stderr, "[%s] Command failed: %s\nOutput: %s\nError: %v\n",
			timestamp, cmdStr, outputStr, err)
	}

	if err != nil {
		return NewExecError(name+" failed", outputStr, err)
	}
	return nil
}

// validateJSON checks if a file contains valid JSON
func validateJSON(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	var js interface{}
	if err := json.Unmarshal(data, &js); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	return nil
}

// cursorAgentLoggedIn checks if cursor-agent is logged in
func cursorAgentLoggedIn() bool {
	cmd := exec.Command("cursor-agent", "whoami")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return !strings.Contains(string(output), "Not logged in")
}

// OpenCodeInstallMethod represents how opencode was installed
type OpenCodeInstallMethod int

const (
	InstallMethodUnknown    OpenCodeInstallMethod = iota
	InstallMethodAUR                              // /usr/bin/opencode via AUR package
	InstallMethodCurlScript                       // ~/.opencode/bin/opencode via official install script
	InstallMethodNpmGlobal                        // npm install -g opencode-ai
	InstallMethodBunGlobal                        // bun install -g opencode-ai
)

func (m OpenCodeInstallMethod) String() string {
	switch m {
	case InstallMethodAUR:
		return "AUR package (opencode-bin)"
	case InstallMethodCurlScript:
		return "Official install script"
	case InstallMethodNpmGlobal:
		return "npm global"
	case InstallMethodBunGlobal:
		return "bun global"
	default:
		return "unknown"
	}
}

// OpenCodeInfo contains information about the opencode installation
type OpenCodeInfo struct {
	Installed     bool
	Version       string
	BinaryPath    string
	InstallMethod OpenCodeInstallMethod
	ConfigDir     string // ~/.config/opencode
	PluginDir     string // ~/.config/opencode/plugin
	NodeModules   string // ~/.config/opencode/node_modules
}

// detectOpenCodeInstall detects how opencode was installed and gathers info
func detectOpenCodeInstall() OpenCodeInfo {
	info := OpenCodeInfo{
		Installed: false,
	}

	// Check if opencode exists
	binaryPath, err := exec.LookPath("opencode")
	if err != nil {
		return info
	}

	info.Installed = true
	info.BinaryPath = binaryPath

	// Get version
	cmd := exec.Command("opencode", "--version")
	if output, err := cmd.Output(); err == nil {
		info.Version = strings.TrimSpace(string(output))
	}

	// Resolve symlinks to get actual binary location
	realPath, err := filepath.EvalSymlinks(binaryPath)
	if err != nil {
		realPath = binaryPath
	}

	// Determine installation method based on binary location
	homeDir, _ := os.UserHomeDir()

	switch {
	case strings.HasPrefix(realPath, "/usr/bin/") || strings.HasPrefix(realPath, "/usr/local/bin/"):
		// Could be AUR or system package
		// Check if installed via pacman (Arch Linux)
		if isInstalledViaPacman() {
			info.InstallMethod = InstallMethodAUR
		} else {
			info.InstallMethod = InstallMethodUnknown
		}
	case strings.HasPrefix(realPath, filepath.Join(homeDir, ".opencode")):
		info.InstallMethod = InstallMethodCurlScript
	case strings.Contains(realPath, "node_modules"):
		// Could be npm or bun global
		if strings.Contains(realPath, ".bun") {
			info.InstallMethod = InstallMethodBunGlobal
		} else {
			info.InstallMethod = InstallMethodNpmGlobal
		}
	default:
		info.InstallMethod = InstallMethodUnknown
	}

	// Set standard config paths (same for all install methods)
	configDir, _ := getConfigDir()
	info.ConfigDir = filepath.Join(configDir, "opencode")
	info.PluginDir = filepath.Join(info.ConfigDir, "plugin")
	info.NodeModules = filepath.Join(info.ConfigDir, "node_modules")

	return info
}

// isInstalledViaPacman checks if opencode is installed via pacman (Arch Linux AUR)
func isInstalledViaPacman() bool {
	cmd := exec.Command("pacman", "-Qs", "opencode")
	if err := cmd.Run(); err != nil {
		return false
	}
	return true
}

// getOpenCodeNodeModulesDir returns the node_modules directory used by opencode for plugins
func getOpenCodeNodeModulesDir() string {
	configDir, err := getConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(configDir, "opencode", "node_modules")
}

func getProjectDir() string {
	if envDir := os.Getenv("OPENCODE_CURSOR_PROJECT_DIR"); envDir != "" {
		return envDir
	}
	if cwd, err := os.Getwd(); err == nil {
		for {
			if _, err := os.Stat(filepath.Join(cwd, "package.json")); err == nil {
				return cwd
			}
			parent := filepath.Dir(cwd)
			if parent == cwd {
				break
			}
			cwd = parent
		}
	}
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}
