# GitHub repository and Pages deployment

Target repository: https://github.com/iltano/cmhs-portal-v2. The portal is a static site, like `xsd-viewer`, with no npm installation, backend or build service. `.nojekyll` is included.

## Files to publish

Align the portal folder with your checkout, keeping `data/`, `examples/`, `templates/`, and the application files together. No ZIP is needed. The included `.gitignore` excludes Finder metadata, generated test reports, old script backups and staging output. Run `ruby --disable-gems prepare_repository.rb` to list the intended public files without creating an archive.

The public catalog contains 26 anonymous example networks from the LPG package and 22 generic library templates, covering 24 element types. The previous deployment's source networks, observed private parameter values and old export archive are not included. Copy the rebuilt `data/elements.sqlite`, `data/catalog.json`, and `data/catalog.js` together; do not retain old versions of those files on the site.

If you have already uploaded older catalog files, replacing them updates the current site but does not remove them from previous Git commits or releases. Review repository history before making that older history public.

## Consultant welcome screen

The screen is currently disabled. The configuration and gate script have opaque filenames referenced by `index.html`. Use the management command below to update the settings; no plaintext GUID is stored in the configuration.

Manage the invitation from this folder:

```sh
# Enable the existing invitation:
ruby --disable-gems configure_invitation.rb --enable

# Generate a new GUID and enable the screen:
ruby --disable-gems configure_invitation.rb --generate --enable

# Supply your own GUID instead:
ruby --disable-gems configure_invitation.rb --guid YOUR-GUID

# Disable the screen:
ruby --disable-gems configure_invitation.rb --disable
```

The command prints a newly configured GUID to the terminal; give that GUID to Consultants. No plaintext GUID is written to public files. Rotating the GUID preserves the enabled/disabled setting unless an explicit flag changes it. Commit and push the modified configuration afterward.

Consultants enter their name and the GUID, not its Base64 value. Case and surrounding braces are accepted. Names stay in local browser storage. Base64 is reversible and script URLs remain discoverable through the page; this only obscures the code. It is not authentication, and hosted files remain publicly downloadable.

When aligning an existing checkout, remove the obsolete `site-config.js` and `beta.js` files from its current tree, then use `git add -A` so those deletions are included. Old commits may still contain earlier codes.

## Commit and push

In your aligned checkout:

```sh
git add -A
git status
git diff --cached --stat
git commit -m "Publish anonymous CMHS example networks"
git push origin main
```

An optional `ruby --disable-gems prepare_repository.rb --stage` clones the intended remote into the ignored `publication/repository` folder and stages the listed files. It never commits, pushes or force-pushes automatically.

## Enable Pages

In **Settings → Pages**, choose **Deploy from a branch**, then **main** and **/(root)**. Expected site URL: `https://iltano.github.io/cmhs-portal-v2/`.

Review the portal and `tests/browser.html` manually in Brave. Local-file drafts and hosted-site drafts use separate browser origins. This public catalog also uses a new storage key so previous deployment drafts do not automatically appear.

[GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Rebuild and verify

Everything needed for a normal rebuild is included:

```sh
ruby --disable-gems build_catalog.rb
ruby --disable-gems tests/check_workspace.rb
ruby --disable-gems tests/run_pure.rb
```

After only editing the XSL/CQMS templates, `ruby --disable-gems build_catalog.rb --templates-only` refreshes their browser bundle. Workspace tests use macOS Ruby, SQLite, xmllint and JavaScriptCore; no browser is launched.
