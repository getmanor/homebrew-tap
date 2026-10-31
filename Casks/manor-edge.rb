# Rendered from https://downloads.mymanor.click/latest.json (macDmg).
# Do not edit by hand: the tap's update-cask workflow re-renders it hourly
# and commits when a new production release appears.
cask "manor-edge" do
  version "1.0.3824"
  sha256 "2a5c470058e6cd8b8bf7599f6455ddda69c4e4d63b120d890ba69165d4964185"

  url "https://downloads.mymanor.click/releases/app/#{version}/ManorEdge.dmg"
  name "MANOR Edge"
  desc "Menu bar app that runs a home's on-site edge"
  homepage "https://mymanor.click/download"

  livecheck do
    url "https://downloads.mymanor.click/latest.json"
    strategy :json do |json|
      json.dig("macDmg", "version")
    end
  end

  # The app updates itself (Sparkle, signed feed); brew upgrade leaves it alone.
  auto_updates true
  depends_on arch: :arm64
  depends_on macos: :ventura

  app "ManorEdge.app"

  # Premium edge services keep running without the app. A Free edge runs
  # inside the app, so it pauses until the app is opened again.
  uninstall quit: "com.manor.edge.menubar"

  # Only the app's own caches and preferences. Pairing and edge state are not
  # the app's to delete: Free ~/.manor-free-edge-native-test, Premium
  # ~/manor-edge, the root-owned /Library/Application Support/MANOR, and the
  # edge-managed ~/Library/LaunchAgents/com.manor.edge.menubar.plist.
  # Disconnect This Mac… in the app removes an edge.
  zap trash: [
    "~/Library/Caches/com.manor.edge.menubar",
    "~/Library/HTTPStorages/com.manor.edge.menubar",
    "~/Library/Preferences/com.manor.edge.menubar.plist",
    "~/Library/Saved Application State/com.manor.edge.menubar.savedState",
    "~/Library/WebKit/com.manor.edge.menubar",
  ]

  caveats <<~EOS
    Open MANOR Edge from Applications to pair this Mac with a key from your account.

    Uninstalling the app does not disconnect this Mac from its home.
    To remove the edge, choose Disconnect This Mac… in the app first.
  EOS
end
