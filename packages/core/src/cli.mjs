import { OpsError } from './validation.mjs';
const commands = {
  tx: ['prepare --intent <json>', 'send --review <id> --approval-file <json> --signed-file <hex> --confirm', 'inspect --hash <hash>', 'status --review <id>', 'receipt --hash <hash>'],
  release: ['verify --manifest <json>', 'artifact --artifact <json>'],
  watch: ['check --url <indexer-health-url>', 'report --input <health-json>'],
  replay: ['capture --hash <hash> --out <json>', 'run --input <capture-json>'],
};
const values = new Set(['rpc','chain-id','state','intent','review','approval-file','signed-file','hash','manifest','artifact','url','input','out','max-age-secs','max-lag']);
const booleans = new Set(['json','help','version','confirm','allow-local-http']);
export function parseArgs(argv) {
  const flags = {}; const args = [];
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (!part.startsWith('--')) { args.push(part); continue; }
    const name = part.slice(2);
    if (Object.hasOwn(flags, name) || (!values.has(name) && !booleans.has(name))) throw Object.assign(new Error('Unknown or repeated option. Use --help.'), { code: 'USAGE' });
    if (booleans.has(name)) flags[name] = true;
    else {
      if (!argv[i+1] || argv[i+1].startsWith('--')) throw Object.assign(new Error('Option requires a value.'), { code: 'USAGE' });
      flags[name] = argv[++i];
    }
  }
  if (args.length > 1) throw Object.assign(new Error('Expected one command.'), { code: 'USAGE' });
  return { command: args[0], flags };
}
export async function runCli(tool, execute, argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  try {
    const { command, flags } = parseArgs(argv);
    const help = { tool: 'quai-' + tool, version: '0.1.0-beta.1', commands: commands[tool], options: ['--json','--rpc <url>','--chain-id <9|15000>','--state <directory>','--allow-local-http'] };
    let result;
    if (flags.version) result = { tool: help.tool, version: help.version };
    else if (flags.help || !command) result = help;
    else {
      result = await execute(command, flags);
    }
    process.stdout.write(JSON.stringify({ ok: true, ...result }, null, json ? 0 : 2) + '\n');
    if (result?.ok === false) process.exitCode = 2;
  } catch (error) {
    const known = error instanceof OpsError || error?.code === 'USAGE';
    const result = { ok: false, error: { code: known ? error.code : 'INTERNAL', message: known ? error.message : 'Operation failed. No automatic retry was attempted.' } };
    process.stdout.write(JSON.stringify(result, null, json ? 0 : 2) + '\n');
    process.exitCode = 1;
  }
}
