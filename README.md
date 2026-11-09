# UmbraCast

UmbraCast generates a web page of links for students to share their screens with a presenter, powered by [VDO.ninja](https://vdo.ninja).

## Features

- Single page with student list showing Share and View buttons
- Screen-only sharing (no webcam)
- High quality video with audio disabled
- CSV import for student roster
- CLI tool for generating static deployments

## Installation

```bash
# Clone with VDO.ninja submodule
git clone --recurse-submodules https://github.com/YOUR_USERNAME/umbracast.git

# Or if already cloned without submodules:
git submodule update --init --recursive
```

## Quick Start

### Option 1: Use the Interactive Page

The page is hosted at https://pu-shd.github.io/classcast/ (or open `index.html` from your own copy).

1. Open the page and load your roster under **Class setup**, either way:
   - **CSV file:** the roster is stored in the class link itself.
   - **Secret gist:** paste the gist's link. The class link points at the gist, so you can edit the roster later and the link stays the same.
2. (Optional) Set a room password and a self-hosted VDO.ninja base URL. Both are saved in the link.
3. Click **Copy** next to **Class link** and post it for students (Canvas, email, etc.).
4. Students open the link and click **Share** next to their name.
5. The presenter opens the same link on the projector computer and clicks **View**.

### Option 2: Generate Static Files with CLI

```bash
./umbracast.sh generate -c students.csv -o ./public
```

Then deploy the `./public` folder to your web server.

## CLI Usage

```
./umbracast.sh <command> [OPTIONS]
```

### Commands

| Command | Description |
|---------|-------------|
| `generate` | Generate ready-to-use HTML/CSS files |
| `init-vdo` | Initialize VDO.ninja submodule for self-hosting |
| `help` | Show help message |

### Generate Options

| Option | Description | Default |
|--------|-------------|---------|
| `-u, --url URL` | VDO.ninja base URL | `https://vdo.ninja` |
| `-r, --room PREFIX` | Room prefix for stream IDs | `classroom_` |
| `-t, --title TITLE` | Page title | `UmbraCast` |
| `-s, --subtitle TEXT` | Page subtitle | Click your name... |
| `-o, --output DIR` | Output directory | `./dist` |
| `-c, --csv FILE` | CSV file with student names | - |
| `-n, --no-header` | CSV has no header row | has header |
| `--column NUM` | Column index for names (0-based) | `0` |
| `--students "A,B,C"` | Comma-separated student names | - |
| `-p, --password PASS` | Room password (prevents interlopers) | - |
| `-h, --help` | Show help | - |

### Examples

```bash
# Generate with default synthetic students
./umbracast.sh generate -o ./public

# Custom VDO.ninja URL and room prefix
./umbracast.sh generate -u https://myserver.edu/vdo -r "math101_"

# From CSV file (first column = names, has header)
./umbracast.sh generate -c students.csv -o ./public

# From CSV with names in second column, no header
./umbracast.sh generate -c roster.csv --column 1 -n

# Inline student list
./umbracast.sh generate --students "Alice,Bob,Carol,David"

# Initialize VDO.ninja submodule for self-hosting
./umbracast.sh init-vdo

# Full example for deployment with password protection
./umbracast.sh generate \
  -u https://yourserver.edu/present/vdo.ninja \
  -r "orf309_" \
  -t "ORF 309 Screen Share" \
  -c roster.csv \
  -p "ClassSecret123" \
  -o ./deploy
```

## CSV Format

The importer accepts standard CSV files:

**Single column:**
```
Alice Chen
Bob Martinez
Carol Johnson
```

**With header:**
```
Name,Email,Section
Alice Chen,alice@univ.edu,001
Bob Martinez,bob@univ.edu,002
```

**Multi-column (use `--column` to select):**
```
ID,Student Name,Major
1,Alice Chen,Math
2,Bob Martinez,CS
```

## Class Links

Everything the page needs is in the part of the URL after `#`:

```
https://pu-shd.github.io/classcast/#session=k3j9x0q2ab&d=z...
```

- `session` keeps everyone's stream IDs the same. Links with only a `session` (from older versions) still work.
- `d` is compressed data: either the roster names, or a reference to a gist, plus the base URL and password if you set them.

Browsers never send the `#` part to the web server, so roster names are not uploaded to GitHub Pages. But **anyone who has the link can see the names and the room password**, so share it only with your class. To keep real names out of the link entirely, use seat numbers or initials.

A link that has been cut off or edited shows an error instead of a roster. Links are limited to 500 students.

### Gist Rosters

1. Create a **secret** gist at https://gist.github.com containing your roster CSV. Secret gists are unlisted (not searchable), but anyone with the gist's URL can read them.
2. Paste the gist's URL into **Class setup** and click **Load**, then choose the header and name-column options.
3. Copy the class link. To change the roster later, edit the gist. GitHub can take up to 5 minutes to serve the new version.

The page loads the gist each time it opens, so if the gist is deleted, the link shows an error.

## Web Interface Features

The interactive `index.html` page includes:

- **Base URL configuration** - Change VDO.ninja server on the fly
- **CSV import** - File picker, or load from a secret gist
- **Class link** - One link holds the roster and settings; copy it for students and the presenter
- **Header toggle** - For CSVs with/without headers
- **Column selector** - Auto-detects "name" columns

## Self-Hosting VDO.ninja

VDO.ninja is included as a git submodule. To use it:

```bash
# Ensure submodule is initialized
git submodule update --init --recursive

# Copy to your web server
cp -r vdo.ninja /path/to/webserver/vdo.ninja

# Generate with your server URL
./umbracast.sh generate -u https://yourserver.com/vdo.ninja -o ./public
```

VDO.ninja is purely client-side and uses public TURN/STUN servers by default, so it works without server-side configuration.

## Development

The page is static: `index.html`, `app.js` (page wiring), `classcast.js` (roster and link logic) and `styles.css`.

```bash
# Lint, type check and unit tests
docker-compose run --rm test

# End-to-end tests in Chromium, WebKit and Firefox
docker-compose run --rm e2e
```

Without Docker: `npm ci`, then `npm run check` and `npx playwright install && npm run e2e`. CI runs both suites on every push and pull request.
