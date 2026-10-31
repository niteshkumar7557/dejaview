# HACKATHON.md

## Team name
Sipmap

## Team members
- Mudit Agrawal
- Nitesh Kumar
- Abhijeet Raj Singh
- Ansh Gupta

## Problem statement
Problem 6: Open Source Decision Intelligence and Knowledge Recovery ("Recover the decisions nobody wrote down")

Our project, **DejaView** ("You've had this debate before"), reads public project discussions (Python PEP
discussions on discuss.python.org, CPython issues and pull requests), extracts the decisions, the rejected
alternatives and the reasons behind them, backs every claim with a verified quote and a link to the original
post, links decisions to the relevant source code, and surfaces them when a new pull request touches that code.

## Models we use and why
- Qwen3.5 9B (`qwen3.5:9b`, open-weight, run with Ollama on our own laptop): extracts decisions, rejected
  alternatives and their reasons from discussion chunks, merges duplicate ideas, and checks our results
  against the real PEP in our self-evaluation. It is the strongest model that runs on our laptop
  (4 GB VRAM, 16 GB RAM) and gives reliable structured JSON output.
- Qwen3.5 4B (`qwen3.5:4b`, open-weight, run with Ollama on our own laptop): sorts every post in a thread
  (proposal / objection / decision / noise) before extraction, so the 9B model only reads the posts that
  matter. Sorting hundreds of posts needs speed more than depth, and the 4B model is much faster on our laptop.

We do not use any closed or paid model APIs.

## AI coding agents
- Claude Code
- MiniMax M3

## License
MIT
