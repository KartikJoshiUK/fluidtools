// Example: Convert Postman collection to LangChain tools

import fs from 'fs';
import { postmanToLangChainCode } from './src/index.js';

// Load Postman collection
const collection = JSON.parse(fs.readFileSync('./api.json', 'utf-8'));

// Convert to LangChain format
const langchainCode = postmanToLangChainCode(collection);

// Save to file
fs.writeFileSync('tools-langchain.ts', langchainCode);

console.log('✅ Converted to LangChain format');
console.log('📄 File saved: tools-langchain.ts');
console.log('\nUsage:');
console.log('  import { generateTools } from "./tools-langchain.js";');
console.log('  const tools = generateTools(process.env.ACCESS_TOKEN);');
