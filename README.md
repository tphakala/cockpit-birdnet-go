# Cockpit BirdNET-Go Plugin

A [Cockpit](https://cockpit-project.org/) management plugin for [BirdNET-Go](https://github.com/tphakala/birdnet-go), providing a web-based interface to monitor, control, and manage BirdNET-Go installations.

## Features

- **Service Management**: Control BirdNET-Go via Docker containers or systemd services
- **Status Monitoring**: Real-time monitoring of Docker, systemd, and application health
- **Version Management**: Automatic detection of updates for both stable and nightly builds
- **GitHub Integration**: Check for new releases and container images from GitHub
- **One-Click Upgrades**: Automated container upgrades with configuration preservation  
- **Health Monitoring**: Application health, uptime, and database connectivity status
- **Log Viewing**: View Docker container logs and BirdNET-Go application logs
- **Responsive UI**: Optimized layout that adapts to different screen sizes
- **Web Interface Integration**: Direct links to BirdNET-Go's web interface

## Screenshots

The plugin provides a comprehensive dashboard showing:
- Service status (Docker/systemd)
- Application health and uptime
- Version information and update notifications
- Control actions (start/stop/restart/upgrade)
- Container and application logs

## Development Dependencies

On Debian/Ubuntu:

    sudo apt install gettext nodejs npm make

On Fedora:

    sudo dnf install gettext nodejs npm make

## Getting and Building the Source

These commands check out the source and build it into the `dist/` directory:

```bash
git clone https://github.com/tphakala/cockpit-birdnet-go.git
cd cockpit-birdnet-go
make
```

## Installing

### Development Installation

For development, install the plugin directly from your git tree:

```bash
make devel-install
```

This creates a symlink from `~/.local/share/cockpit/birdnet-go` to your development directory.

Manual development installation:
```bash
mkdir -p ~/.local/share/cockpit
ln -s `pwd`/dist ~/.local/share/cockpit/birdnet-go
```

### Production Installation  

`make install` compiles and installs the package in `/usr/local/share/cockpit/`. The convenience targets `srpm` and `rpm` build the source and binary rpms respectively.

In production mode, source files are automatically minified and compressed. Set `NODE_ENV=production` if you want to duplicate this behavior.

### Development Workflow

After changing the code and running `make` again, reload the Cockpit page in your browser.

You can also use [watch mode](https://esbuild.github.io/api/#watch) to automatically update the bundle on every code change:

    ./build.js -w

or

    make watch

#### Remote Development

When developing against a virtual machine, watch mode can automatically upload code changes by setting the `RSYNC` environment variable:

    RSYNC=your-vm-hostname make watch

When developing against a remote host as a normal user, use `RSYNC_DEVEL`:

    RSYNC_DEVEL=example.com make watch

### Uninstalling

To uninstall the development version:

    make devel-uninstall

or manually remove the symlink:

    rm ~/.local/share/cockpit/birdnet-go

## Requirements

### Runtime Requirements
- Cockpit (>= 251)
- BirdNET-Go installation (Docker or systemd service)
- Docker (if using containerized BirdNET-Go)

### Supported BirdNET-Go Configurations
- Docker containers (standalone or via systemd)
- Systemd services running Docker containers
- Both stable releases and nightly builds

## Usage

1. Install and start Cockpit on your system
2. Ensure BirdNET-Go is installed (Docker or systemd service)
3. Install this plugin using the instructions above
4. Access Cockpit web interface and navigate to "BirdNET-Go" in the sidebar

The plugin will automatically detect your BirdNET-Go installation and provide appropriate management options.

## Code Quality

### Running eslint

The plugin uses [ESLint](https://eslint.org/) to automatically check JavaScript/TypeScript code style in `.js[x]` and `.ts[x]` files.

ESLint is executed as part of `test/static-code`, aka. `make codecheck`.

For developer convenience, ESLint can be started explicitly by:

    npm run eslint

Violations of some rules can be fixed automatically by:

    npm run eslint:fix

Rules configuration can be found in the `.eslintrc.json` file.

### Running stylelint

The plugin uses [Stylelint](https://stylelint.io/) to automatically check CSS code style in `.css` and `scss` files.

Stylelint is executed as part of `test/static-code`, aka. `make codecheck`.

For developer convenience, Stylelint can be started explicitly by:

    npm run stylelint

Violations of some rules can be fixed automatically by:

    npm run stylelint:fix

Rules configuration can be found in the `.stylelintrc.json` file.

## Testing

### Running Tests Locally

Run `make check` to build an RPM, install it into a standard Cockpit test VM (centos-9-stream by default), and run the test/check-application integration test on it.

After the test VM is prepared, you can manually run the test without rebuilding the VM:

    TEST_OS=centos-9-stream test/check-application -tvs

It is possible to setup the test environment without running the tests:

    TEST_OS=centos-9-stream make prepare-check

You can also run the test against a different Cockpit image:

    TEST_OS=fedora-40 make check

### Running Tests in CI

Tests can be run in [Cirrus CI](https://cirrus-ci.org/) and [Packit](https://packit.dev/) for continuous integration. See the configuration files:
- [.cirrus.yml](./.cirrus.yml) for Cirrus CI
- [packit.yaml](./packit.yaml) for Packit

## Architecture

The plugin is built using:
- **React 18** with TypeScript for the UI
- **PatternFly 5** for consistent Cockpit styling
- **ESBuild** for fast compilation
- **Cockpit APIs** for system integration

Key components:
- Service detection and monitoring (Docker/systemd)
- GitHub API integration for version checking
- Real-time status updates and log streaming
- Responsive grid layout with breakpoints

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes following the existing code style
4. Test your changes with `make check`
5. Submit a pull request

## License

This project is licensed under the GNU Lesser General Public License v2.1 or later. See the [LICENSE](LICENSE) file for details.

## Related Links

- [BirdNET-Go Project](https://github.com/tphakala/birdnet-go)
- [Cockpit Project](https://cockpit-project.org/)
- [Cockpit Developer Documentation](https://cockpit-project.org/guide/latest/)
- [PatternFly Design System](https://www.patternfly.org/)