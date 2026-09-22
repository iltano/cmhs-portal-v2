# CMHS Portal v2

A lightweight, browser-based editor and visualization tool for ** MessageHub network configurations**.

CMHS Portal v2 provides a visual way to inspect, understand, modify, and export MessageHub networks without requiring a local installation or a full MessageHub environment.

## Features

* Visualize MessageHub networks as connected diagrams.
* Inspect producers, processors, decorators, consumers, and other network elements.
* Edit element configuration directly from the browser.
* Add elements from the built-in component library.
* Copy and reuse configured elements between networks.
* Create new networks from existing examples or from scratch.
* Open or unload a configuration folder containing an `.mhc` file and its linked `.mhn` networks.
* Rename, duplicate, or remove networks while synchronizing their hub registrations.
* Rearrange network diagrams automatically or manually.
* Create and modify connections between elements.
* Validate network structure before export.
* Export modified `.mhn` network files.
* Preserve unknown XML settings and metadata when editing existing networks.
* Generate supporting XSL, CQMS query, and consolidated CPMS process configuration files where applicable.
* Work with query mappings associated with individual networks and XML decorators.
* Undo and redo network changes during the editing session.

## Runs locally in your browser

CMHS Portal is designed as a client-side application.

**Files you open are processed locally in your browser and are not uploaded to a server.**

Drafts and workspace preferences may be stored using your browser's local storage so that work can survive a page refresh.

This means that opening a MessageHub configuration in the editor does not send its contents to the website host.

## Getting started

1. Open CMHS Portal in your browser.
2. Select one of the included example networks or import your own MessageHub network.
3. Select an element in the diagram to inspect its configuration.
4. Add, remove, move, rename, or reconnect elements as required.
5. Use the validation tools to check the resulting network.
6. Export the modified network when finished.

The exported file is a new copy; the original file on your computer is not modified.

## Full MessageHub configurations

Use **Import configuration** to choose a folder containing one `.mhc` file and its registered `.mhn` files. The portal opens the linked networks together. **Export configuration** creates a ZIP with the `.mhc` and linked `.mhn` files in the same folder, plus any selected XSL, CQMS, or CPMS files. **Hub configuration** includes an unload action that removes only the linked configuration networks from this browser workspace.

Network Settings can rename, duplicate, or delete a network. Renaming also updates each element name and its connection references. New and duplicated networks are registered in the exported hub configuration; deleted networks are removed from it.

## Example networks

The application includes anonymized example configurations intended to demonstrate common MessageHub network structures and component types. They are bundled into the offline catalog, so the published site does not need the raw example source folder.

These examples are provided as starting points for exploration and configuration. Names, comments, paths, credentials, and other deployment-specific information have been replaced with neutral example values.

The component library also contains generic templates for commonly used MessageHub element types.

When adapting an example to a real environment, always review its configuration before deployment.

## Component library

The built-in library makes it possible to add known MessageHub elements without manually writing their XML structure.

Depending on the component, its configuration can include properties such as:

* module and handler type
* polling configuration
* file and directory settings
* network variables
* HTTP or web-service settings
* transformations
* XML decorators
* database/query configuration

Values shown in example components are templates and should be reviewed before use in a real MessageHub environment.

Use **Update workspace library** after importing or editing networks to add their configured elements to the reusable library stored in your browser.

## Network editing

Network elements can be positioned visually and connected directly in the workspace.

CMHS coordinates use positive integers: `x` increases to the right and `y` increases downward. The canvas origin is `0,0`; elements begin at `5,6`, and imported negative coordinates are shifted into that valid area.

When elements are copied between networks, CMHS Portal adjusts generated names where necessary to keep them unique within the destination network.

Connections and references are updated as part of the editing workflow.

## XSL, query, and process configuration

CMHS Portal includes helpers for workflows involving XSL transformations and  queries.

Generated XML files are normalized so that they contain exactly one UTF-8 XML declaration.

Query configuration can be associated with specific network and XMLDecorator combinations rather than being applied globally to every generated stylesheet.

During export, you can also create one CPMS file containing a `processConfig` entry for every network in the export. The supplied CPMS server placeholder is retained so it can be set for the destination environment.

## Import and export

The editor works with MessageHub XML configuration while attempting to preserve configuration that it does not explicitly understand.

This is particularly useful when inspecting or modifying existing networks because application-specific metadata and settings can remain intact during a round trip through the editor.

Always review exported configuration before installing it in a production environment.

## What CMHS Portal does not do

CMHS Portal is an **editor and visualization tool**.

It does not:

* execute MessageHub networks
* connect to a MessageHub runtime
* test external endpoints
* validate credentials
* deploy configuration to a server
* replace environment-specific integration testing

Runtime behavior should still be tested in the appropriate MessageHub environment.

## Browser storage

CMHS Portal can use browser local storage for items such as:

* drafts
* the currently selected network
* workspace preferences
* session-related UI information

This information remains in the browser profile in which the application is used.

Clearing the browser's site data will also clear locally stored CMHS Portal data.

## Project status

CMHS Portal v2 is under active development.

Although automated checks are used to verify network parsing, XML generation, component handling, and other editor functionality, exported configurations should always be reviewed and tested before production use.

## Feedback

Bug reports, suggestions, and improvements are welcome through the GitHub repository.

When reporting a problem involving a real MessageHub configuration, please remove customer names, credentials, hostnames, personal information, and other sensitive data before attaching files.
