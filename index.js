#!/usr/bin/env node

console.log("🚀 My CLI is working!");

const args = process.argv.slice(2);

if (args[0] === "greet") {
  console.log(`Hello, ${args[1] || "Developer"} 👋`);
}
