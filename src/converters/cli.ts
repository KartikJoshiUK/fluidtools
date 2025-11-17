#!/usr/bin/env node
// CLI tool to convert Postman collections to LangChain tools

import fs from 'fs';
import { postmanToLangChainCode } from './utils.js';

const args = process.argv.slice(2);

if (args.length < 1) {
    console.log(`
Usage: node cli.js <input-file> [output-file]

Example:
  node cli.js api.json tools.ts
  node cli.js api.json
  `);
    process.exit(1);
}

const [inputFile, outputFile] = args;

// Read Postman collection
const collection = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

// Generate LangChain code
const code = postmanToLangChainCode(collection);

if (outputFile) {
    fs.writeFileSync(outputFile, code);
    const toolCount = collection.item ? collection.item.length : 0;
    console.log(`✅ Converted ${toolCount} tools to LangChain format`);
    console.log(`📄 Output saved to: ${outputFile}`);
} else {
    console.log(code);
}
