# Contributing

Thanks for contributing to CyberCity ICS/OT! To keep `main` stable, we follow a simple branch-based workflow.

## Branching Workflow

- `main` — always stable/deployable. Direct commits are not allowed.
- `dev` — active development branch. All work is committed here first.

**Flow:**

1. Commit your changes to `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   # make your changes
   git commit -m "..."
   git push origin dev
   ```
2. Once changes on `dev` are ready for release, open a pull request from `dev` into `main`.
3. Merge the PR into `main` after review.

## Rules

- Never commit directly to `main`.
- All changes go to `dev` first, and reach `main` only through a pull request.
- Write clear commit messages describing the *why*, not just the *what*.

## Reporting Issues

Open a GitHub issue with steps to reproduce, expected behavior, and actual behavior.
