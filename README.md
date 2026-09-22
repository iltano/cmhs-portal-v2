# CMHS Portal v2

CMHS Portal is a browser-based workspace for viewing, editing, and exporting MessageHub networks. It helps consultants understand an integration visually, make controlled XML changes, and prepare files for review without running MessageHub.

Files are processed locally in the browser. Nothing is uploaded to the portal server.

## Start here

1. Open an included example, use **Import .mhn**, or choose **Import configuration** for a folder containing an `.mhc` file and its linked `.mhn` files.
2. Select a network in the left panel and inspect its elements on the diagram.
3. Select an element to edit its parameters, attributes, comment, position, or XML.
4. Use **Check network** before exporting.
5. Choose the export that matches the work completed.

The portal always downloads a new file or ZIP. It never overwrites the source files on the computer.

## What you can do

- View producers, processors, consumers, and their connections as a diagram.
- Move elements, pan, zoom, arrange the graph, and align selected elements.
- Add components by dragging them from the library.
- Copy and paste configured parts of a network into another network.
- Add file writers or database log writers.
- Edit, duplicate, replace, rename, or delete elements and networks.
- Create a new network and manage network variables.
- Validate one producer, valid connection direction, no self-connections, one input source per element, and reachable outputs.
- Undo and redo network edits.

New, copied, and renamed elements use a component type plus serial convention, for example `XSL_1`, `XSL_2`, and `XMLFileWriter_1`.

## Configurations

**Import configuration** opens the `.mhc` and only the `.mhn` files it registers. Imported configuration network names are preserved. Duplicate network names within one configuration are rejected.

Use **Hub configuration** to review the configuration XML or unload the configuration from the browser workspace. Drag configuration entries in the left panel to change their registration sequence. When a configuration is open, the same panel includes a **Network library**: drag a network from it onto the configuration to create a named configuration copy. The lower-left **Unload configuration** action removes linked networks from the local workspace.

## Export choices

| Option | Result |
| --- | --- |
| **Export current** | The active `.mhn` network only. |
| **Export updated networks** | Only networks changed after import or creation. |
| **Export configuration** | A ZIP containing the `.mhc` and all linked `.mhn` files together, plus selected generated files. |

During an export, the portal can also generate starter XSL files, CQMS query files, and one consolidated CPMS process configuration. Review generated content and environment-specific values before deployment.

## Library and examples

The built-in library contains anonymized examples and generic element templates. **Update workspace library** adds configured elements from the current browser workspace as reusable local templates.

Example values, paths, and comments are illustrative. Review every parameter, connection, query, path, and environment setting before using an export outside a test environment.

## Local storage and limits

Drafts, the open configuration, and workspace templates can be stored in the browser profile. Clearing the site data removes them. Export files regularly to keep a portable copy of work.

CMHS Portal is an editor. It does not execute networks, connect to MessageHub, test endpoints, validate credentials, or deploy files.

## Feedback

Please report usability issues, unexpected XML output, missing element settings, and export problems through the GitHub repository. Remove customer names, credentials, hostnames, and personal information from any files or screenshots shared for support.
