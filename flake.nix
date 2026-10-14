{
  description = "protoncalendar-tasks browser extension";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.imagemagick
            pkgs.nodejs
            pkgs.zip
          ];

          # @playwright/test must match playwright-driver's version
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";

          shellHook = ''
            echo "protoncalendar-tasks dev environment"
            echo "playwright-driver ${pkgs.playwright-driver.version}"
            echo "run: npm install && npm test"
          '';
        };
      }
    );
}
