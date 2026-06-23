import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

assert.equal(existsSync(join(root, '.app.json')), false, 'Cowart-style plugin must not use .app.json');
assert.equal(existsSync(join(root, 'apps')), false, 'Canvas app should live at the plugin root src directory');
assert.equal(existsSync(join(root, 'server')), false, 'MCP server should live at mcp/server.mjs');
assert.equal(existsSync(join(root, 'src', 'App.jsx')), true);
assert.equal(existsSync(join(root, 'mcp', 'server.mjs')), true);
assert.equal(existsSync(join(root, 'vite.config.js')), true);

const pluginJson = JSON.parse(await readFile(join(root, '.codex-plugin', 'plugin.json'), 'utf8'));
assert.equal(pluginJson.name, 'image-agent-canvas');
assert.equal(pluginJson.skills, './skills/');
assert.equal(pluginJson.mcpServers, './.mcp.json');
assert.equal(Object.hasOwn(pluginJson, 'apps'), false);

const mcpJson = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'));
const serverConfig = mcpJson.mcpServers?.['image-agent-canvas'];
assert.ok(serverConfig, 'Expected image-agent-canvas MCP server config');
assert.match(serverConfig.args.join(' '), /scripts[\\/]start-mcp\.(ps1|sh)/);

const child = spawn(process.execPath, ['mcp/server.mjs'], {
  cwd: root,
  stdio: ['pipe', 'pipe', 'pipe']
});

let buffer = '';
const messages = [];
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let newline = buffer.indexOf('\n');
  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) messages.push(JSON.parse(line));
    newline = buffer.indexOf('\n');
  }
});

child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);

const deadline = Date.now() + 4000;
while (Date.now() < deadline && messages.length < 2) {
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
}

child.kill();
await once(child, 'exit');

const init = messages.find((message) => message.id === 1);
const tools = messages.find((message) => message.id === 2);
assert.equal(init?.result?.serverInfo?.name, 'Image Agent Canvas MCP');
assert.deepEqual(
  tools?.result?.tools?.map((tool) => tool.name).sort(),
  [
    'create_ai_image_holder',
    'create_canvas_branch',
    'export_canvas_archive',
    'export_edit_pack',
    'get_canvas_selection',
    'import_canvas_archive',
    'insert_canvas_image',
    'insert_error_note',
    'insert_prompt_card',
    'insert_reference_image',
    'open_canvas_service',
    'read_canvas_layers',
    'search_inspiration_library'
  ].sort()
);

console.log('Image Agent Canvas Cowart-style smoke passed');
