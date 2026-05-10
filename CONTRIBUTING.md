# Contributing to HabitatMQ

Thanks for your interest! HabitatMQ is a personal project open-sourced for the reptile and aquarium keeping community. Contributions are welcome.

## What's in scope

- Bug fixes
- New animal profile types (e.g. tortoise, chameleon, axolotl)
- Additional sensor types / MQTT topic formats
- UI/UX improvements for mobile
- Documentation improvements
- Raspberry Pi setup guides for different hardware configs

## What's out of scope

- Cloud/SaaS integrations — HabitatMQ is intentionally self-hosted
- Breaking changes to the SQLite schema without a migration path
- Commercial features

## Getting started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/HabitatMQ.git`
3. Install dependencies: `npm install`
4. Run locally: `npm run dev`
5. Make your changes on a feature branch: `git checkout -b feat/your-feature`
6. Open a pull request against `main`

## Code style

- TypeScript — no `any` unless unavoidable
- Tailwind for styling — no inline styles
- Keep components under 400 lines; split into sub-components if needed
- API routes in `src/app/api/` follow the existing REST pattern

## Reporting bugs

Open an issue using the **Bug Report** template. Include:
- What hardware you're running on
- What animal/profile type you're using
- Steps to reproduce
- Screenshot or console output if relevant

## License

By contributing, you agree your contributions will be licensed under the same
[CC BY-NC-SA 4.0](LICENSE) license as the project.
