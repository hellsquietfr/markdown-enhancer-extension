//@ts‑check
'use strict';

const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig */

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js‑context
  // We default to 'none' so dev builds are fast and un‑minified:
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode' // don’t bundle the vscode module
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  },

  // In dev: produce a “nosources” map for debugging. In production, the CLI
  // script passes --devtool hidden‑source‑map, so you’ll still get a .map.
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: 'log'
  },

  optimization: {
    minimize: process.env.NODE_ENV === 'production',
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          ecma: 2020,
          compress: {
            drop_console: true,
            dead_code: true,
            unused: true
          },
          mangle: true,
          output: {
            comments: false
          }
        },
        extractComments: false
      })
    ]
  }
};

module.exports = [extensionConfig];
