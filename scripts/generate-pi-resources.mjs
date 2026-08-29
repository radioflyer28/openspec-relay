import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDiscussionContract } from './discussion-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'openspec-extension.json'), 'utf8'));
const outputRoot = path.join(root, 'pi');
const grillingBody = await fs.readFile(path.join(root, 'vendor', 'grilling', 'SKILL.body.md'), 'utf8');
const thirdPartyNotice = await fs.readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');

await Promise.all([
  fs.rm(path.join(outputRoot, 'prompts'), { recursive: true, force: true }),
  fs.rm(path.join(outputRoot, 'skills'), { recursive: true, force: true }),
]);

for (const workflow of manifest.contributes.workflows) {
  let body;
  if (workflow.id === 'discuss') {
    const supplement = (await fs.readFile(path.join(root, 'workflows', 'discuss.md'), 'utf8')).trimEnd();
    validateDiscussionContract({ body: grillingBody, supplement, notice: thirdPartyNotice });
    body = `${grillingBody.trimEnd()}\n\n${supplement}`;
    await fs.writeFile(path.join(root, workflow.entry), `${body}\n`);
  } else {
    body = (await fs.readFile(path.join(root, workflow.entry), 'utf8')).trimEnd();
  }
  const promptPath = path.join(outputRoot, 'prompts', `opsx-${workflow.id}.md`);
  const skillPath = path.join(outputRoot, 'skills', `openspec-${workflow.id}`, 'SKILL.md');
  const prompt = `---\ndescription: ${JSON.stringify(workflow.description)}\n---\n\n${body}\n`;
  const skill = `---\nname: openspec-${workflow.id}\ndescription: ${workflow.description}\nlicense: MIT\ncompatibility: Requires the openspec and openspec-gsd CLIs.\nmetadata:\n  author: openspec-gsd\n  version: ${JSON.stringify(manifest.version)}\n---\n\n${body}\n`;

  await fs.mkdir(path.dirname(promptPath), { recursive: true });
  await fs.mkdir(path.dirname(skillPath), { recursive: true });
  await fs.writeFile(promptPath, prompt);
  await fs.writeFile(skillPath, skill);
}
