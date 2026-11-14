#!/usr/bin/env python3
"""
launcher script for the wnba pipeline with different run options.
this script shows how to run the system with the most common configurations.
"""

import subprocess
import sys
import argparse


def run_full():
    """run the full etl (extract + transform + load)"""
    print("Command: python3 main.py --etl 1 --dashboard 0")
    subprocess.run([
        sys.executable, "main.py",
        "--etl", "1",
        "--dashboard", "0",
    ])


def run_transform_load():
    """transform what was already downloaded and load it (no download)"""
    print("Command: python3 main.py --etl 1 --extract 0 --dashboard 0")
    subprocess.run([
        sys.executable, "main.py",
        "--etl", "1",
        "--extract", "0",
        "--dashboard", "0",
    ])


def run_load():
    """only load what is in transformed_data/ into postgres"""
    print("Command: python3 main.py --etl 1 --extract 0 --transform 0 --dashboard 0")
    subprocess.run([
        sys.executable, "main.py",
        "--etl", "1",
        "--extract", "0",
        "--transform", "0",
        "--dashboard", "0",
    ])


def run_dashboard():
    """refresh the dashboard data and start it at http://localhost:3000"""
    print("Command: python3 main.py --etl 0 --dashboard 1")
    subprocess.run([
        sys.executable, "main.py",
        "--etl", "0",
        "--dashboard", "1",
    ])


def run_all():
    """run the full etl, then refresh and start the dashboard"""
    print("🏀 running etl + dashboard...")
    print("Command: python3 main.py --etl 1 --dashboard 1")
    subprocess.run([
        sys.executable, "main.py",
        "--etl", "1",
        "--dashboard", "1",
    ])


def main():
    parser = argparse.ArgumentParser(description='WNBA Engineering Launcher')
    parser.add_argument('--mode', choices=['etl', 'transform-load', 'load', 'dashboard', 'all'],
                        default='etl', help='Mode to run')

    args = parser.parse_args()

    if args.mode == 'etl':
        run_full()
    elif args.mode == 'transform-load':
        run_transform_load()
    elif args.mode == 'load':
        run_load()
    elif args.mode == 'dashboard':
        run_dashboard()
    elif args.mode == 'all':
        run_all()


if __name__ == "__main__":
    main()
