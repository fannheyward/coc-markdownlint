'use strict';

// via https://github.com/DavidAnson/vscode-markdownlint/blob/master/generate-config-schema.js

const fs = require('fs');
const packageJsonPath = './package.json';
const packageJson = require(packageJsonPath);
const configurationSchema = require('./node_modules/markdownlint/schema/markdownlint-config-schema.json');
const properties = configurationSchema.properties;
for (const k of Object.keys(properties)) {
  const v = properties[k];
  if (v['$ref']) {
    const kk = v['$ref'].split('/').pop();
    properties[k] = properties[kk];
  }
}
configurationSchema.properties = properties;

// Update package.json
const configurationRoot = packageJson.contributes.configuration.properties['markdownlint.config'];
configurationRoot.properties = configurationSchema.properties;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

fs.writeFileSync('./schemas/markdownlint-config-schema.json', JSON.stringify(configurationSchema, null, 2) + '\n');
