pkgname=suri
pkgver=1.0.2
pkgrel=1
pkgdesc="Suri the custom slack client"
arch=('x86_64' 'aarch64')
url="https://github.com/gizzyuwu/suri"
license=('MIT')
depends=('cairo' 'desktop-file-utils' 'gdk-pixbuf2' 'glib2' 'gtk3' 'hicolor-icon-theme' 'libsoup' 'pango' 'webkit2gtk-4.1')
options=('!strip' '!emptydirs')
install=${pkgname}.install
source_x86_64=("${url}/releases/download/v${pkgver}/suri_${pkgver}_amd64.deb")
source_aarch64=("${url}/releases/download/v${pkgver}/suri_${pkgver}_arm64.deb")
sha256sums_x86_64=('SKIP')
sha256sums_aarch64=('SKIP')

package() {
  # Extract package data
  tar -xvf data.tar.gz -C "${pkgdir}"

}