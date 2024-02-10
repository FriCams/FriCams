# FriCams
## About
FriCams is a Progressive Web App (PWA) for Frigate camera users to view all my cameras and recordings on my mobile phone.

<p align="center">
<img src="https://f003.backblazeb2.com/file/7ak-public/fricams/FriCams.png" alt="image" style="width:150px;height:auto;">
<p>

As such, you need to have Frigate installed and running, as well as go2rtc configured (https://docs.frigate.video/guides/configuring_go2rtc)

## Features
View your camera streams as well as recordings, in your browser or on your phone, as a PWA. 

# Installation via Docker
## Requirements
PWA needs to needs to be hosted on a secure server. Thus: 
- Frigate needs to be running on https (for example using NGINX).
- FriCams also needs to be running on https. If you're running FriCams locally, you generated certificates using mkcert (https://github.com/FiloSottile/mkcert). Copy your cert and key to the root of the project (see Installation Steps).

## Installation Steps
1. Clone from github
2. cd into FriCams directory
3. Copy your cert.pem and key.pem into the directory (see Requirements above)
4. Run `docker build -f Dockerfile . -t fricams:<tag>` (specify your tag or use the current FriCams version number)
5. Run `docker run fricams:<tag>`