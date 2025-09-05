# Open Build Service (OBS) Integration

This workflow automatically submits releases to the Open Build Service for multi-distribution packaging.

## Prerequisites

1. **OBS Account**: Create an account at https://build.opensuse.org/

2. **OBS Project**: Create a project in OBS (e.g., `home:yourusername`)

3. **Configure Build Targets**: In your OBS project, configure which distributions to build for:
   - openSUSE Leap
   - openSUSE Tumbleweed
   - Fedora
   - Debian
   - Ubuntu
   - etc.

## Setting up GitHub Secrets

The workflow requires secure credentials stored as GitHub Secrets. Never commit credentials to the repository!

### Required Secrets

1. **Go to your repository's Settings → Secrets and variables → Actions**

2. **Add the following secrets:**

   - `OBS_USERNAME`: Your OBS username
   - `OBS_PASSWORD`: Your OBS password (or API token - recommended)
   - `OBS_PROJECT` (optional): Your OBS project name (defaults to `home:username`)

### Getting an OBS API Token (Recommended)

Instead of using your password, create an API token:

1. Log into https://build.opensuse.org/
2. Go to your profile → "Manage your tokens"
3. Create a new token with package management permissions
4. Use this token as `OBS_PASSWORD`

### Required Repository Variable

- `OBS_ENABLED`: Set to `true` to enable the workflow

Set this in Settings → Secrets and variables → Actions → Variables

## Workflow Triggers

The workflow runs automatically when:
- A new release is published on GitHub
- Manually triggered via Actions tab (with optional version input)

## What the Workflow Does

1. **Builds the Cockpit plugin** from source
2. **Creates packaging files** for RPM and DEB
3. **Submits to OBS** which then:
   - Builds packages for all configured distributions
   - Runs any configured tests
   - Publishes to OBS repositories

## Manual Trigger

You can manually trigger the workflow:

1. Go to Actions tab
2. Select "Submit to Open Build Service"
3. Click "Run workflow"
4. Optionally specify a version number
5. Click "Run workflow" button

## Monitoring Builds

After submission, monitor build status at:
```
https://build.opensuse.org/package/show/PROJECT_NAME/cockpit-birdnet-go
```

## Security Best Practices

1. **Use API tokens** instead of passwords when possible
2. **Rotate credentials** periodically
3. **Use environment-specific secrets** for different OBS instances
4. **Monitor access logs** in OBS for unauthorized access
5. **Limit token permissions** to only what's needed

## Troubleshooting

### Workflow not running
- Check that `OBS_ENABLED` variable is set to `true`
- Verify all required secrets are configured

### Authentication failures
- Verify credentials are correct
- Check if token has expired
- Ensure token has package management permissions

### Build failures in OBS
- Check OBS build logs
- Verify package dependencies are available in target distributions
- Check spec/debian files for syntax errors

## Adding Repository to Systems

Once packages are built, users can add your OBS repository:

### For openSUSE/SLES:
```bash
zypper addrepo https://download.opensuse.org/repositories/PROJECT_NAME/DISTRO/PROJECT_NAME.repo
zypper refresh
zypper install cockpit-birdnet-go
```

### For Fedora:
```bash
dnf config-manager --add-repo https://download.opensuse.org/repositories/PROJECT_NAME/Fedora_XX/PROJECT_NAME.repo
dnf install cockpit-birdnet-go
```

### For Debian/Ubuntu:
```bash
echo 'deb http://download.opensuse.org/repositories/PROJECT_NAME/DISTRO/ /' | sudo tee /etc/apt/sources.list.d/PROJECT_NAME.list
curl -fsSL https://download.opensuse.org/repositories/PROJECT_NAME/DISTRO/Release.key | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/PROJECT_NAME.gpg > /dev/null
apt update
apt install cockpit-birdnet-go
```

Replace `PROJECT_NAME` with your OBS project and `DISTRO` with the distribution version.