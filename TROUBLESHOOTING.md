# Troubleshooting Guide

This guide helps you resolve common issues with the OpenSpec VS Code extension.

## Table of Contents

- [OpenCode Server Issues](#opencode-server-issues)
- [Chat UI Issues](#chat-ui-issues)
- [Port Conflicts](#port-conflicts)
- [Task Execution Issues](#task-execution-issues)
- [Extension Activation Issues](#extension-activation-issues)
- [Getting Help](#getting-help)

---

## OpenCode Server Issues

### Server won't start

**Symptoms:**
- Error message: "Failed to start OpenCode server"
- Terminal shows command not found
- Port 4099 is already in use

**Solutions:**

1. **Check if opencode is installed:**
   ```bash
   opencode --version
   ```
   If not found, install it:
   ```bash
   npm install -g opencode-ai
   ```

2. **Check if port 4099 is in use:**
   ```bash
   # On Windows
   netstat -ano | findstr :4099
   
   # On macOS/Linux
   lsof -i :4099
   ```
   If occupied, kill the process or let the extension find another port.

3. **Check terminal output:**
   - Open the `OpenCode Server` terminal in VS Code
   - Look for error messages
   - Common issues: missing dependencies, permission errors

### Server starts but extension can't connect

**Symptoms:**
- "Connection refused" errors
- Chat UI shows "Server unavailable"
- Commands timeout

**Solutions:**

1. **Verify server is running:**
   ```bash
   curl http://localhost:4099/health
   ```

2. **Check firewall settings:**
   - Ensure localhost connections are allowed
   - Some corporate firewalls block local ports

3. **Restart the server:**
   - Kill existing server process
   - Run command: `OpenSpec: Start OpenCode Server`

---

## Chat UI Issues

### Chat panel won't open

**Symptoms:**
- Command `OpenSpec: Open Chat` does nothing
- Chat panel is blank
- Error notification appears

**Solutions:**

1. **Check extension activation:**
   - Ensure workspace has `openspec/` folder at root
   - Reload window: `Developer: Reload Window`

2. **Check VS Code version:**
   - Requires VS Code ^1.74.0
   - Update if needed

3. **Clear extension state:**
   - Run command: `OpenSpec: Clear Chat History`
   - Or manually delete from global storage

### Messages not sending

**Symptoms:**
- Input field accepts text but nothing happens on Enter
- Messages appear in UI but no response
- "Sending..." indicator stuck

**Solutions:**

1. **Check server connection:**
   - Look for connection status indicator in chat UI
   - If disconnected, start the server first

2. **Check message format:**
   - Empty messages are blocked
   - Very long messages (>10KB) may fail

3. **Enable debug mode:**
   ```json
   {
     "openspec.debug.enabled": true
   }
   ```
   Check Output panel for error details.

### Chat history lost after reload

**Symptoms:**
- Messages disappear when VS Code restarts
- Session not restored

**Solutions:**

1. **Check storage settings:**
   - Ensure `openspec.chat.maxMessages` > 0
   - Default is 100 messages

2. **Manual backup:**
   - Export chat before reloading if needed
   - Use `/status` command to check session info

---

## Port Conflicts

### Port already in use

**Symptoms:**
- Error: "Port 4099 is already in use"
- Extension tries alternative ports
- Multiple workspaces conflict

**Solutions:**

1. **Let extension auto-detect:**
   - Extension scans 4000-4999 range
   - First available port is used

2. **Configure preferred port:**
   ```json
   {
     "openspec.server.port": 4100
   }
   ```

3. **Kill existing processes:**
   ```bash
   # Find process using port
   lsof -i :4099
   
   # Kill it
   kill -9 <PID>
   ```

### Multi-workspace issues

**Symptoms:**
- Extension works in one window but not another
- Changes appear in wrong workspace
- Server attaches to wrong folder

**Note:** Multi-root workspaces are not fully supported. Each VS Code window should have its own OpenCode server on a different port.

**Workaround:**
- Use different ports per workspace
- Manually specify port in settings
- Close other VS Code windows when working on specific project

---

## Task Execution Issues

### Apply command fails

**Symptoms:**
- `/apply` command returns error
- Ralph loop doesn't start
- Tasks not being processed

**Solutions:**

1. **Check tasks.md exists:**
   - Navigate to `openspec/changes/<change-id>/`
   - Verify `tasks.md` is present

2. **Check ralph_opencode.mjs:**
   - Ensure file exists in workspace root
   - Check file permissions (executable)

3. **Verify change ID:**
   - Use `/status` to see current change
   - Ensure you're in the right change context

4. **Check task format:**
   - Tasks must follow format: `- [ ] <id> <description>`
   - IDs like `1.1`, `2.3`, etc.

### Fast-forward doesn't work

**Symptoms:**
- `/ff` command does nothing
- "No scaffold-only changes found"
- Artifacts not generated

**Solutions:**

1. **Check change status:**
   - Fast-forward only works on scaffold-only changes
   - Change must have only `.openspec.yaml` (no tasks.md)

2. **Verify OpenCode session:**
   - Must have active session from `/new`
   - Check `/status` for session info

3. **Check server logs:**
   - Look for errors in OpenCode Server terminal
   - May indicate skill loading issues

---

## Extension Activation Issues

### Extension not activating

**Symptoms:**
- OpenSpec view not in Activity Bar
- Commands not available
- No output in Output panel

**Solutions:**

1. **Check workspace:**
   - Must have `openspec/` folder at root
   - Run `openspec init` if missing

2. **Check extension is enabled:**
   - Open Extensions view
   - Ensure OpenSpecCodeExplorer is enabled

3. **Reload window:**
   - Run `Developer: Reload Window`
   - Or restart VS Code

4. **Check for errors:**
   - Open Developer Tools: `Help > Toggle Developer Tools`
   - Look for errors in Console

### Commands not found

**Symptoms:**
- "Command not found" error
- Command palette doesn't show OpenSpec commands
- Keyboard shortcuts don't work

**Solutions:**

1. **Wait for activation:**
   - Extension activates on `openspec/` folder detection
   - May take a few seconds

2. **Check activation events:**
   - Commands only available when workspace has openspec
   - Some commands require server connection

3. **Reinstall extension:**
   - Uninstall from Extensions view
   - Reload window
   - Reinstall from VSIX or marketplace

---

## Getting Help

### Collecting diagnostic information

Before reporting an issue, collect:

1. **Extension version:**
   - Open Extensions view
   - Find OpenSpecCodeExplorer
   - Note version number

2. **VS Code version:**
   - Run `Help > About`
   - Copy version info

3. **OpenCode version:**
   ```bash
   opencode --version
   ```

4. **Extension logs:**
   - Open Output panel
   - Select `OpenSpec Extension`
   - Copy relevant logs

5. **Server logs:**
   - Open `OpenCode Server` terminal
   - Copy error messages

### Reporting issues

Report issues at: https://github.com/AngDrew/openspec-vscode/issues

Include:
- VS Code version
- Extension version
- OpenCode version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (with sensitive info removed)

### Debug mode

Enable detailed logging:

```json
{
  "openspec.debug.enabled": true,
  "openspec.debug.structuredLogging": true
}
```

This outputs structured JSON logs to the Output panel for easier debugging.

---

## Quick Fixes Checklist

- [ ] Restart VS Code
- [ ] Reload window (`Developer: Reload Window`)
- [ ] Restart OpenCode server
- [ ] Check port availability
- [ ] Verify opencode is installed and on PATH
- [ ] Check workspace has `openspec/` folder
- [ ] Clear chat history
- [ ] Enable debug mode and check logs
- [ ] Reinstall extension

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Port 4099 is already in use" | Another process using port | Kill process or use different port |
| "Failed to start OpenCode server" | opencode not installed or error | Install opencode, check terminal output |
| "Connection refused" | Server not running | Start server first |
| "No scaffold-only changes found" | Change already has tasks.md | Use `/apply` instead of `/ff` |
| "Command not found" | Extension not activated | Check workspace has openspec/ folder |
| "Session expired" | Session timeout or server restart | Start new session with `/new` |

---

*Last updated: 2026-02-03*
