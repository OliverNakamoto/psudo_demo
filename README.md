# Pseudo README

This VS Code extension transforms all open files into `.txt` files using ChatGPT (gpt-4o).
Each file is sent to the OpenAI API with a prompt, and the resulting output is saved 
as a new `.txt` file next to the original.

## Features

- Command: "Transform Open Files to .txt via ChatGPT"
- Sends each open file to ChatGPT 4o
- Creates `.txt` versions of each file with summarized content

## Requirements

- Requires an OpenAI API key to be available as the `OPENAI_API_KEY` environment variable

## Known Issues

- No error shown if the API key is missing
- Does not handle rate limiting or streaming yet

## Release Notes

### 0.0.1

- Initial version: transforms files to `.txt` using GPT-4o

