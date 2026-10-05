#!/bin/sh
# Renders YouTube thumbnails; see branding/thumbnails.js for the options.
exec node "$(dirname "$0")/thumbnails.js" "$@"
