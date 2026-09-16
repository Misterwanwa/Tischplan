// Skript zur Generierung von konsistenten Prompts für alle Produkte aus public/products.csv
// Ausführung mit: node scripts/generate_pictogram_prompts.js

import fs from 'fs';
import path from 'path';

const csvPath = path.resolve('public', 'products.csv');
const outputPath = path.resolve('scripts', 'prompts_output.json');
const textOutputPath = path.resolve('scripts', 'prompts_list.txt');

if (!fs.existsSync(csvPath)) {
  console.error('products.csv nicht gefunden unter:', csvPath);
  process.exit(1);
}

const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

// Header überspringen
const dataLines = lines.slice(1);

const results = [];
const textLines = [];

for (const line of dataLines) {
  const parts = line.split(';');
  if (parts.length < 2) continue;

  const id = parts[0].trim();
  const name = parts[1].trim();
  const category = parts[2] ? parts[2].trim() : 'Lebensmittel';

  // Bring!-typischer Master-Prompt
  const promptMidjourney = `A minimalist flat line-art doodle pictogram of ${name}, in the signature visual style of the Bring! grocery shopping app. Thick white chalk lines, hand-drawn vector sketch, rounded stroke ends, single stroke weight, simple organic outlines with minimal interior details, centered icon, isolated on transparent background, no color, no gradients, no 3D --v 6.1 --style raw`;
  
  const promptRecraft = `White hand-drawn chalk doodle icon of ${name}, category: ${category}, minimal line art, smooth rounded vector strokes, isolated on transparent background, cute grocery app icon style.`;

  results.push({
    id,
    name,
    category,
    targetFilename: `${id}.svg`,
    promptMidjourney,
    promptRecraft
  });

  textLines.push(`[${id}.svg] (${name} - ${category})\n${promptMidjourney}\n`);
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
fs.writeFileSync(textOutputPath, textLines.join('\n'), 'utf-8');

console.log(`Erfolgreich ${results.length} Produkt-Prompts generiert!`);
console.log(`JSON gespeichert in: ${outputPath}`);
console.log(`Textliste gespeichert in: ${textOutputPath}`);
