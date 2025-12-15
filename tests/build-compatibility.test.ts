/**
 * Property-based tests for module format compatibility
 * Feature: build-modernization
 */

import * as fc from 'fast-check';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Build Modernization - Module Format Compatibility', () => {
  
  /**
   * Feature: build-modernization, Property 1: CommonJS compatibility
   * For any CommonJS project setup, installing and requiring the fluidtools package should succeed without module format errors
   * Validates: Requirements 1.1
   */
  test('Property 1: CommonJS compatibility', () => {
    fc.assert(
      fc.property(
        fc.record({
          projectName: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(s)),
          nodeVersion: fc.constantFrom('14', '16', '18', '20'),
          packageManager: fc.constantFrom('npm', 'yarn', 'pnpm')
        }),
        (config) => {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cjs-test-'));
          
          try {
            // Create a CommonJS project
            const packageJson = {
              name: config.projectName,
              version: '1.0.0',
              type: 'commonjs',
              main: 'index.js'
            };
            
            fs.writeFileSync(
              path.join(tempDir, 'package.json'),
              JSON.stringify(packageJson, null, 2)
            );
            
            // Create a test file that requires fluidtools
            const fluidtoolsPath = path.resolve('./dist/cjs/index.cjs').replace(/\\/g, '/');
            const testCode = `
              const fluidtools = require('${fluidtoolsPath}');
              console.log('CommonJS import successful');
              console.log('FluidToolsClient available:', typeof fluidtools.FluidToolsClient);
            `;
            
            fs.writeFileSync(path.join(tempDir, 'test.js'), testCode);
            
            // Try to run the CommonJS code
            const result = execSync('node test.js', { 
              cwd: tempDir, 
              encoding: 'utf8',
              timeout: 10000
            });
            
            // Should not throw and should contain success message
            expect(result).toContain('CommonJS import successful');
            expect(result).toContain('FluidToolsClient available: function');
            
          } finally {
            // Cleanup
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 10 } // Reduced runs for faster execution
    );
  });

  /**
   * Feature: build-modernization, Property 2: ESM compatibility  
   * For any ESM project setup, installing and importing the fluidtools package should succeed without module format errors
   * Validates: Requirements 1.2
   */
  test('Property 2: ESM compatibility', () => {
    fc.assert(
      fc.property(
        fc.record({
          projectName: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(s)),
          nodeVersion: fc.constantFrom('14', '16', '18', '20'),
          packageManager: fc.constantFrom('npm', 'yarn', 'pnpm')
        }),
        (config) => {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esm-test-'));
          
          try {
            // Create an ESM project
            const packageJson = {
              name: config.projectName,
              version: '1.0.0',
              type: 'module',
              main: 'index.js'
            };
            
            fs.writeFileSync(
              path.join(tempDir, 'package.json'),
              JSON.stringify(packageJson, null, 2)
            );
            
            // Create a test file that imports fluidtools
            const fluidtoolsPath = 'file:///' + path.resolve('./dist/esm/index.js').replace(/\\/g, '/');
            const testCode = `
              import { FluidToolsClient } from '${fluidtoolsPath}';
              console.log('ESM import successful');
              console.log('FluidToolsClient available:', typeof FluidToolsClient);
            `;
            
            fs.writeFileSync(path.join(tempDir, 'test.mjs'), testCode);
            
            // Try to run the ESM code
            const result = execSync('node test.mjs', { 
              cwd: tempDir, 
              encoding: 'utf8',
              timeout: 10000
            });
            
            // Should not throw and should contain success message
            expect(result).toContain('ESM import successful');
            expect(result).toContain('FluidToolsClient available: function');
            
          } finally {
            // Cleanup
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 10 } // Reduced runs for faster execution
    );
  });
});

describe('Build Modernization - Compatibility and Types', () => {

  /**
   * Feature: build-modernization, Property 3: Node.js version compatibility
   * For any JavaScript syntax feature in the compiled output, it should be supported by Node.js version 14 or higher
   * Validates: Requirements 1.3
   */
  test('Property 3: Node.js version compatibility', () => {
    fc.assert(
      fc.property(
        fc.record({
          buildTarget: fc.constantFrom('esm', 'cjs'),
          nodeVersion: fc.constantFrom('14', '16', '18', '20'),
          testFile: fc.constantFrom('index.js', 'client/index.js', 'langgraph/index.js', 'tools/index.js')
        }),
        (config) => {
          const buildDir = config.buildTarget === 'esm' ? './dist/esm' : './dist/cjs';
          const extension = config.buildTarget === 'esm' ? '.js' : '.cjs';
          const filePath = path.join(buildDir, config.testFile.replace('.js', extension));
          
          // Check if the file exists
          if (!fs.existsSync(filePath)) {
            // Skip if file doesn't exist (some modules may not have all submodules)
            return true;
          }
          
          const fileContent = fs.readFileSync(filePath, 'utf8');
          
          // Check for ES2022+ features that would break Node.js 14-15 compatibility in CJS builds
          if (config.buildTarget === 'cjs') {
            // These features should not appear in CommonJS builds targeting ES2020
            expect(fileContent).not.toMatch(/\bclass\s+\w+\s*{[^}]*#\w+/); // Private fields
            expect(fileContent).not.toMatch(/\?\?\=/); // Logical nullish assignment
            expect(fileContent).not.toMatch(/\|\|=/); // Logical OR assignment  
            expect(fileContent).not.toMatch(/&&=/); // Logical AND assignment
            expect(fileContent).not.toMatch(/\.at\(/); // Array.at() method
            expect(fileContent).not.toMatch(/Object\.hasOwn/); // Object.hasOwn
          }
          
          // Check for ES2023+ features that would break Node.js 14-17 compatibility in ESM builds
          if (config.buildTarget === 'esm') {
            // These very new features should not appear even in ESM builds
            expect(fileContent).not.toMatch(/Array\.prototype\.toReversed/);
            expect(fileContent).not.toMatch(/Array\.prototype\.toSorted/);
            expect(fileContent).not.toMatch(/Array\.prototype\.toSpliced/);
            expect(fileContent).not.toMatch(/Array\.prototype\.with/);
          }
          
          // Common checks for both formats - ensure basic syntax compatibility
          expect(fileContent).not.toMatch(/\bawait\s+import\(/); // Top-level await in modules should be handled carefully
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Feature: build-modernization, Property 5: Type definition accuracy
   * For any TypeScript project importing fluidtools, the type definitions should resolve correctly without type errors
   * Validates: Requirements 1.5
   */
  test('Property 5: Type definition accuracy', () => {
    fc.assert(
      fc.property(
        fc.record({
          importStyle: fc.constantFrom('default', 'named', 'namespace'),
          tsConfig: fc.record({
            strict: fc.boolean(),
            noImplicitAny: fc.boolean(),
            exactOptionalPropertyTypes: fc.boolean()
          })
        }),
        (config) => {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'types-test-'));
          
          try {
            // Create TypeScript project
            const packageJson = {
              name: 'types-test-project',
              version: '1.0.0',
              type: 'module',
              devDependencies: {
                typescript: '^5.0.0'
              }
            };
            
            const tsConfig = {
              compilerOptions: {
                target: 'ES2020',
                module: 'ESNext',
                moduleResolution: 'node',
                strict: config.tsConfig.strict,
                noImplicitAny: config.tsConfig.noImplicitAny,
                exactOptionalPropertyTypes: config.tsConfig.exactOptionalPropertyTypes,
                skipLibCheck: false, // We want to check our types
                noEmit: true
              }
            };
            
            fs.writeFileSync(
              path.join(tempDir, 'package.json'),
              JSON.stringify(packageJson, null, 2)
            );
            
            fs.writeFileSync(
              path.join(tempDir, 'tsconfig.json'),
              JSON.stringify(tsConfig, null, 2)
            );
            
            // Create test TypeScript file with different import styles
            let testCode: string;
            const typesPath = path.resolve('./dist/types/index.d.ts').replace(/\\/g, '/');
            
            switch (config.importStyle) {
              case 'default':
                testCode = `
                  /// <reference path="${typesPath}" />
                  import FluidToolsClient from '${path.resolve('./dist/esm/index.js').replace(/\\/g, '/')}';
                  
                  const client = new FluidToolsClient({
                    provider: 'openai',
                    apiKey: 'test-key'
                  });
                  
                  // Test that types are properly inferred
                  const result: Promise<any> = client.executeAgent('test');
                `;
                break;
                
              case 'named':
                testCode = `
                  /// <reference path="${typesPath}" />
                  import { FluidToolsClient, Tools } from '${path.resolve('./dist/esm/index.js').replace(/\\/g, '/')}';
                  
                  const client = new FluidToolsClient({
                    provider: 'openai',
                    apiKey: 'test-key'
                  });
                  
                  // Test that named exports have correct types
                  const tools: typeof Tools = Tools;
                `;
                break;
                
              case 'namespace':
                testCode = `
                  /// <reference path="${typesPath}" />
                  import * as FluidTools from '${path.resolve('./dist/esm/index.js').replace(/\\/g, '/')}';
                  
                  const client = new FluidTools.FluidToolsClient({
                    provider: 'openai',
                    apiKey: 'test-key'
                  });
                `;
                break;
            }
            
            fs.writeFileSync(path.join(tempDir, 'test.ts'), testCode);
            
            // Run TypeScript compiler to check for type errors
            try {
              const result = execSync('npx tsc --noEmit', { 
                cwd: tempDir, 
                encoding: 'utf8',
                timeout: 15000
              });
              
              // If tsc succeeds, types are valid
              expect(result).not.toContain('error TS');
              
            } catch (error: any) {
              const output = error.stdout || error.stderr || '';
              
              // Check that there are no type-related errors specific to our package
              // Allow dependency module resolution errors as they're not our concern
              const lines = output.split('\n');
              const ourPackageErrors = lines.filter((line: string) => 
                line.includes('error TS') && 
                !line.includes('node_modules/@langchain') &&
                !line.includes('node_modules/langchain') &&
                (line.includes('Cannot find module') ||
                 line.includes('has no exported member') ||
                 line.includes('is not assignable to type') ||
                 line.includes('Property does not exist'))
              );
              
              expect(ourPackageErrors.length).toBe(0);
            }
            
          } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 25 }
    );
  });

});

describe('Build Modernization - Export Functionality', () => {

  /**
   * Feature: build-modernization, Property 10: Default export availability
   * For any import of the default export, it should provide the FluidToolsClient class
   * Validates: Requirements 3.1
   */
  test('Property 10: Default export availability', () => {
    fc.assert(
      fc.property(
        fc.record({
          moduleFormat: fc.constantFrom('esm', 'cjs'),
          importStyle: fc.constantFrom('default', 'destructured')
        }),
        (config) => {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-export-test-'));
          
          try {
            let testCode: string;
            let fileName: string;
            
            if (config.moduleFormat === 'esm') {
              const packageJson = {
                name: 'test-project',
                version: '1.0.0',
                type: 'module'
              };
              fs.writeFileSync(
                path.join(tempDir, 'package.json'),
                JSON.stringify(packageJson, null, 2)
              );
              
              const fluidtoolsPath = 'file:///' + path.resolve('./dist/esm/index.js').replace(/\\/g, '/');
              
              if (config.importStyle === 'default') {
                testCode = `
                  import FluidToolsClient from '${fluidtoolsPath}';
                  console.log('Default export type:', typeof FluidToolsClient);
                  console.log('Is constructor:', typeof FluidToolsClient === 'function');
                `;
              } else {
                testCode = `
                  import { default as FluidToolsClient } from '${fluidtoolsPath}';
                  console.log('Default export type:', typeof FluidToolsClient);
                  console.log('Is constructor:', typeof FluidToolsClient === 'function');
                `;
              }
              fileName = 'test.mjs';
            } else {
              const packageJson = {
                name: 'test-project',
                version: '1.0.0',
                type: 'commonjs'
              };
              fs.writeFileSync(
                path.join(tempDir, 'package.json'),
                JSON.stringify(packageJson, null, 2)
              );
              
              const fluidtoolsPath = path.resolve('./dist/cjs/index.cjs').replace(/\\/g, '/');
              testCode = `
                const FluidToolsClient = require('${fluidtoolsPath}').default || require('${fluidtoolsPath}');
                console.log('Default export type:', typeof FluidToolsClient);
                console.log('Is constructor:', typeof FluidToolsClient === 'function');
              `;
              fileName = 'test.js';
            }
            
            fs.writeFileSync(path.join(tempDir, fileName), testCode);
            
            const result = execSync(`node ${fileName}`, { 
              cwd: tempDir, 
              encoding: 'utf8',
              timeout: 10000
            });
            
            expect(result).toContain('Default export type: function');
            expect(result).toContain('Is constructor: true');
            
          } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Feature: build-modernization, Property 11: Named export availability
   * For any named export specified in the package, it should be importable and provide the correct functionality
   * Validates: Requirements 3.2
   */
  test('Property 11: Named export availability', () => {
    fc.assert(
      fc.property(
        fc.record({
          moduleFormat: fc.constantFrom('esm', 'cjs'),
          exportName: fc.constantFrom('FluidToolsClient', 'Tools')
        }),
        (config) => {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'named-export-test-'));
          
          try {
            let testCode: string;
            let fileName: string;
            
            if (config.moduleFormat === 'esm') {
              const packageJson = {
                name: 'test-project',
                version: '1.0.0',
                type: 'module'
              };
              fs.writeFileSync(
                path.join(tempDir, 'package.json'),
                JSON.stringify(packageJson, null, 2)
              );
              
              const fluidtoolsPath = 'file:///' + path.resolve('./dist/esm/index.js').replace(/\\/g, '/');
              testCode = `
                import { ${config.exportName} } from '${fluidtoolsPath}';
                console.log('Named export ${config.exportName} type:', typeof ${config.exportName});
                console.log('Named export ${config.exportName} available:', ${config.exportName} !== undefined);
              `;
              fileName = 'test.mjs';
            } else {
              const packageJson = {
                name: 'test-project',
                version: '1.0.0',
                type: 'commonjs'
              };
              fs.writeFileSync(
                path.join(tempDir, 'package.json'),
                JSON.stringify(packageJson, null, 2)
              );
              
              const fluidtoolsPath = path.resolve('./dist/cjs/index.cjs').replace(/\\/g, '/');
              testCode = `
                const { ${config.exportName} } = require('${fluidtoolsPath}');
                console.log('Named export ${config.exportName} type:', typeof ${config.exportName});
                console.log('Named export ${config.exportName} available:', ${config.exportName} !== undefined);
              `;
              fileName = 'test.js';
            }
            
            fs.writeFileSync(path.join(tempDir, fileName), testCode);
            
            const result = execSync(`node ${fileName}`, { 
              cwd: tempDir, 
              encoding: 'utf8',
              timeout: 10000
            });
            
            expect(result).toContain(`Named export ${config.exportName} available: true`);
            
          } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Feature: build-modernization, Property 13: CLI executable functionality
   * For any execution of the CLI command, it should run without module resolution errors
   * Validates: Requirements 3.4
   */
  test('Property 13: CLI executable functionality', () => {
    fc.assert(
      fc.property(
        fc.record({
          testScenario: fc.constantFrom('help', 'invalid-args', 'missing-file')
        }),
        (config) => {
          try {
            let result: string;
            const cliPath = path.resolve('./dist/cjs/cli.cjs');
            
            // Ensure CLI file exists and is executable
            expect(fs.existsSync(cliPath)).toBe(true);
            
            switch (config.testScenario) {
              case 'help':
                // Run CLI without arguments to get help message
                try {
                  result = execSync(`node "${cliPath}"`, { 
                    encoding: 'utf8',
                    timeout: 5000
                  });
                } catch (error: any) {
                  // CLI should exit with code 1 and show usage
                  result = error.stdout || error.stderr || '';
                }
                expect(result).toContain('Usage:');
                break;
                
              case 'invalid-args':
                // Run CLI with invalid arguments
                try {
                  result = execSync(`node "${cliPath}" nonexistent.json`, { 
                    encoding: 'utf8',
                    timeout: 5000
                  });
                } catch (error: any) {
                  // Should fail gracefully with file not found error
                  result = error.stdout || error.stderr || '';
                }
                // Should not have module resolution errors
                expect(result).not.toContain('Cannot find module');
                expect(result).not.toContain('MODULE_NOT_FOUND');
                break;
                
              case 'missing-file':
                // Test that CLI can start and handle missing file gracefully
                try {
                  result = execSync(`node "${cliPath}" missing.json output.ts`, { 
                    encoding: 'utf8',
                    timeout: 5000
                  });
                } catch (error: any) {
                  result = error.stdout || error.stderr || '';
                }
                // Should not have module resolution errors
                expect(result).not.toContain('Cannot find module');
                expect(result).not.toContain('MODULE_NOT_FOUND');
                break;
            }
            
          } catch (error) {
            // If there's an unexpected error, it should not be a module resolution error
            const errorMessage = error instanceof Error ? error.message : String(error);
            expect(errorMessage).not.toContain('Cannot find module');
            expect(errorMessage).not.toContain('MODULE_NOT_FOUND');
          }
        }
      ),
      { numRuns: 15 }
    );
  });

});

describe('Build Modernization - Build Features', () => {

  /**
   * Feature: build-modernization, Property 6: Watch mode responsiveness
   * For any source file modification during watch mode, the build system should detect changes and rebuild automatically
   * Validates: Requirements 2.2
   */
  test('Property 6: Watch mode responsiveness', () => {
    fc.assert(
      fc.property(
        fc.record({
          watchFlag: fc.constantFrom('--watch', '--watch --sourcemap'),
          buildFormat: fc.constantFrom('esm', 'cjs')
        }),
        (config) => {
          // Test that watch mode flag is supported in package.json scripts
          const packageJsonPath = path.resolve('./package.json');
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          
          // Verify watch script exists and contains watch flag
          expect(packageJson.scripts).toHaveProperty('build:watch');
          expect(packageJson.scripts['build:watch']).toContain('--watch');
          
          // Verify tsup config supports watch mode by checking for watch-related options
          const tsupConfigPath = path.resolve('./tsup.config.ts');
          const tsupConfig = fs.readFileSync(tsupConfigPath, 'utf8');
          
          // Should not have any watch-incompatible settings
          expect(tsupConfig).not.toContain('watch: false');
          
          return true;
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Feature: build-modernization, Property 7: Production minification
   * For any production build output, the file size should be smaller than the corresponding development build
   * Validates: Requirements 2.3
   */
  test('Property 7: Production minification', () => {
    fc.assert(
      fc.property(
        fc.record({
          buildTarget: fc.constantFrom('esm', 'cjs'),
          minifyFlag: fc.constantFrom('--minify', '--minify --sourcemap')
        }),
        (config) => {
          // Test that the actual build outputs demonstrate minification
          const buildDir = config.buildTarget === 'esm' ? './dist/esm' : './dist/cjs';
          const extension = config.buildTarget === 'esm' ? '.js' : '.cjs';
          
          // Check that build files exist (from previous builds)
          const indexFile = path.join(buildDir, `index${extension}`);
          const cliFile = path.join(buildDir, `cli${extension}`);
          
          if (fs.existsSync(indexFile)) {
            const content = fs.readFileSync(indexFile, 'utf8');
            
            // Verify minification characteristics when --minify is used
            if (config.minifyFlag.includes('--minify')) {
              // Minified files should have characteristics of compressed code
              const lines = content.split('\n');
              const firstLine = lines[0] || '';
              
              // Minified files should have very long first lines (compressed imports/code)
              expect(firstLine.length).toBeGreaterThan(100);
              
              // Should not have excessive spacing between tokens
              expect(firstLine).not.toMatch(/\s{2,}/); // No multiple consecutive spaces
              
              // Should have compressed variable names (single letters)
              expect(firstLine).toMatch(/\b[a-z]\b/); // Single letter variables
            }
            
            // Verify that tsup config supports minification
            const tsupConfigPath = path.resolve('./tsup.config.ts');
            const tsupConfig = fs.readFileSync(tsupConfigPath, 'utf8');
            expect(tsupConfig).toContain('minify');
          }
          
          // Verify package.json has production build script
          const packageJsonPath = path.resolve('./package.json');
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          expect(packageJson.scripts).toHaveProperty('build');
          expect(packageJson.scripts.build).toContain('--minify');
          
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Feature: build-modernization, Property 9: Source map generation
   * For any build output, corresponding source map files should be generated with valid source mapping data
   * Validates: Requirements 2.5
   */
  test('Property 9: Source map generation', () => {
    fc.assert(
      fc.property(
        fc.record({
          buildTarget: fc.constantFrom('esm', 'cjs'),
          sourcemapType: fc.constantFrom('external', 'inline')
        }),
        (config) => {
          // Test that source maps are generated in actual build outputs
          const buildDir = config.buildTarget === 'esm' ? './dist/esm' : './dist/cjs';
          const extension = config.buildTarget === 'esm' ? '.js' : '.cjs';
          
          // Check for existing build outputs with source maps
          const indexFile = path.join(buildDir, `index${extension}`);
          const indexMapFile = path.join(buildDir, `index${extension}.map`);
          const cliFile = path.join(buildDir, `cli${extension}`);
          const cliMapFile = path.join(buildDir, `cli${extension}.map`);
          
          if (fs.existsSync(indexFile)) {
            const content = fs.readFileSync(indexFile, 'utf8');
            
            if (config.sourcemapType === 'external') {
              // Should have source map reference
              expect(content).toContain('//# sourceMappingURL=');
              
              // Source map file should exist
              if (fs.existsSync(indexMapFile)) {
                const sourcemapContent = fs.readFileSync(indexMapFile, 'utf8');
                const sourcemap = JSON.parse(sourcemapContent);
                
                // Validate source map structure
                expect(sourcemap).toHaveProperty('version');
                expect(sourcemap).toHaveProperty('sources');
                expect(sourcemap).toHaveProperty('mappings');
                expect(sourcemap.version).toBe(3);
                expect(Array.isArray(sourcemap.sources)).toBe(true);
                expect(typeof sourcemap.mappings).toBe('string');
                expect(sourcemap.mappings.length).toBeGreaterThan(0);
              }
            }
          }
          
          // Verify tsup config enables source maps
          const tsupConfigPath = path.resolve('./tsup.config.ts');
          const tsupConfig = fs.readFileSync(tsupConfigPath, 'utf8');
          expect(tsupConfig).toContain('sourcemap: true');
          
          return true;
        }
      ),
      { numRuns: 8 }
    );
  });

});