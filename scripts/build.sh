#!/usr/bin/env bash

set -e

# Skip heavy build, just ensure dependencies are installed
# The mastra dev server will handle bundling at runtime
echo "Build step skipped - using runtime bundling"
exit 0
