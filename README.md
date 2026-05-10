<a id="readme-top"></a>

<br />
<div align="center">
  <a href="https://github.com/gizzyuwu/suri">
    <img src="public/suri.svg" alt="Suri" width="128" height="128">
  </a>
  <h3 align="center">Suri</h3>
  <p align="center">
      A custom desktop client for Slack built with SolidJS and Tauri
    <br />
    <br />
    <a href="https://github.com/GizzyUwU/suri/releases/latest">Latest Release</a>
    ·
    <a href="https://github.com/gizzyuwu/suri/issues">Report Bug</a>
  </p>

[![SolidJS][SolidJS]][SolidJS-url] [![Tauri][Tauri]][Tauri-url]

</div>

<!-- TABLE OF CONTENTS -->
<details open>
  <summary>Table of Contents</summary>
  <ol>
      <li><a href="#why-not-windows-or-mac">Why not Windows or Mac?</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
    </li>
    <li><a href="#license">License</a></li>
  </ol>
</details>

## Why not Windows or Mac?
For a mac simply to put it I don't got a mac to test why it won't work so I can't distribute a software that I can not fix.

Windows on the other hand I am trying to resolve issues with the OAuth that's why there is a build for windows but no working build for windows at the moment as i'm trying to resolve as I am mainly a linux user not a windows user.


## Use Arch Linux? Follow this!
Since there is no packaged appimage, arch users need to use a slightly more complex method to install but its still pretty easy. Just run the commands below and it should install fine!

```bash
git clone https://github.com/gizzyuwu/suri.git
cd suri
makepkg -si
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

- BunJS
- SCCache
- Cargo

### Installation

1. Clone the repo

```sh
git clone https://github.com/gizzyuwu.git
```

2. Install NPM packages

```sh
bun install
```

3. Run dev command
```sh
bun run dev
```

## Star History

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://api.star-history.com/svg?repos=gizzyuwu/suri&type=Date&theme=dark"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://api.star-history.com/svg?repos=gizzyuwu/suri&type=Date"
  />
  <img
    alt="Star History Chart"
    src="https://api.star-history.com/svg?repos=gizzyuwu/suri&type=Date"
  />
</picture>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->

## License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->

[SolidJS]: https://img.shields.io/badge/SolidJS-2c4f7c?style=for-the-badge&logo=solid&logoColor=c8c9cb
[SolidJS-url]: https://www.solidjs.com/
[Tauri]: https://img.shields.io/badge/tauri-%2324C8DB.svg?style=for-the-badge&logo=tauri&logoColor=%23FFFFFF
[Tauri-url]: https://tauri.app
