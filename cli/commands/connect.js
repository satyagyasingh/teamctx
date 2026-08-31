import { promisify } from 'util';
import { execFile } from 'child_process';
import { readConfig } from '../../src/storage.js';
import { connectorUrl, NoDeployUrlError, NoGithubRemoteError } from './connect.core.js';

const execFileAsync = promisify(execFile);

/**
 * Read from the git remote rather than config: it is the same answer, it stays
 * correct if the repo is renamed or transferred, and it needs nothing recorded.
 */
async function originRemote() {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function connectCommand() {
  const config = readConfig();
  let result;
  try {
    result = connectorUrl({ deployUrl: config.deployUrl, remote: await originRemote() });
  } catch (err) {
    console.error(`\nError: ${err.message}.\n`);
    if (err instanceof NoDeployUrlError) {
      console.error('  If the project is deployed:  teamctx config deploy-url https://<your-deployment>');
      console.error('  If it is not yet:            see docs/mcp-hosted-setup.md\n');
    } else if (err instanceof NoGithubRemoteError) {
      console.error('  Point origin at the GitHub repository this project lives in.\n');
    }
    process.exit(1);
  }

  console.log(`\n  Connector URL for ${config.project || result.repo}:\n`);
  console.log(`    ${result.url}\n`);
  console.log('  Send this to anyone you have added to the project. In Claude:');
  console.log('  Settings → Connectors → Add custom connector → paste the URL.');
  console.log('  They will be asked to sign in; that is expected.\n');
  console.log('  Full steps for them: docs/mcp-join.md\n');
}
