#!/usr/bin/env python3

# run docker compose pipeline - see below for usage

import sys
import os
import pathlib

usage = """
Usage: sh/pipeline SETUP COMMAND PROFILES

Run a docker-compose yaml file with optional list of profiles to include.

SETUP     setup subfolder, eg vmc, ccs-pa
COMMAND   start (default), startd (run detached), stop (stop all services)
PROFILES  space-delim list of profiles to start, or 'all' (default is none)

eg `sh/pipeline ccs-pa startd play`

Note: use `docker kill SERVICE` to stop an individual service
"""

if len(sys.argv) < 2:
    print(usage)
    sys.exit(1)

setup = sys.argv[1]  # eg 'vmc'
cmd = sys.argv[2] or 'start'  # eg 'start', 'startd', 'stop'
profiles = sys.argv[3:]  # eg ['play-mqtt']

# add main compose file for pipeline
composefile = f"setups/pipeline.yaml"
args = f"--file {composefile}"

# add compose file for setup overrides
composefile2 = f"setups/{setup}/pipeline.yaml"
if pathlib.Path(composefile2).exists():
    args += f" --file {composefile2}"

# add envfile
# . should be per setup folder?
# envfile = f"setups/{setup}/.env"
envfile = f"setups/.env"
if pathlib.Path(envfile).exists():
    args += f" --env-file {envfile}"

# get profile flags
profileFlags = ' '.join(
    [f"--profile {profile}" for profile in profiles]) or 'all'

# get flags
flags = ''
if cmd == 'startd':
    flags = '--detach'

if cmd == 'start' or cmd == 'startd':
    # pull any required images in the docker-compose files and start services.
    cmd = f"""SETUP={setup} docker-compose {args} {profileFlags} pull && \
SETUP={setup} docker-compose {args} {profileFlags} up --build {flags}"""
    print(cmd)
    os.system(cmd)

elif cmd == 'stop':
    cmd = f"SETUP={setup} docker-compose {args} down"
    print(cmd)
    os.system(cmd)
