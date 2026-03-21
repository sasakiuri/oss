# Changesets

This project uses [changesets](https://github.com/changesets/changesets) for version management.

## Adding a changeset

When making changes, run:

```bash
npx changeset
```

This will prompt you to select which packages were affected and the type of change (patch/minor/major).

## Releasing

To create a new version:

```bash
npx changeset version
npx changeset publish
```
