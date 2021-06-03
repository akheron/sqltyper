let
  pinnedNixpkgs = import (builtins.fetchTarball {
    name = "nixpkgs-20.09";
    url = https://github.com/NixOS/nixpkgs/archive/20.09.tar.gz;
    # Hash obtained using `nix-prefetch-url --unpack <url>`
    # sha256 = "0mhqhq21y5vrr1f30qd2bvydv4bbbslvyzclhw0kdxmkgg3z4c92";
  }) {};
in
{ pkgs ? pinnedNixpkgs }:
pkgs.stdenv.mkDerivation rec {
  name = "aperi-new";
  buildInputs = [
    pkgs.nodejs-14_x
  ];
}
