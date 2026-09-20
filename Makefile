DOCS := --workspace=@sasakiuri/saika-docs
.PHONY: setup env deps dev up down doctor check qa qa-docs e2e pdf lint-infra load-test load-test-smoke
setup: env deps doctor

env:
	@test -f packages/saika-docs/.env.local || cp packages/saika-docs/.env.example packages/saika-docs/.env.local

deps:
	npm ci --ignore-scripts

dev:
	npm run dev $(DOCS)

up:
	node scripts/doctor.mjs --docker
	node scripts/docker-context.mjs
	SAIKA_DOCKER_CONTEXT=.tools/docker-context docker compose up --build -d --wait docs

down:
	docker compose down

doctor:
	node scripts/doctor.mjs

lint-infra:
	node scripts/lint-infra.mjs

load-test-smoke:
	npm run test:load:smoke $(DOCS)

load-test:
	npm run test:load $(DOCS)

check:
	npm run check

qa:
	npm run qa

qa-docs:
	npm run check $(DOCS)
	npm audit --audit-level=high
	npm run license-check
	node --test scripts/check-required-ci.test.mjs

e2e:
	npm run test:e2e $(DOCS)

pdf:
	npm run build $(DOCS)
	npm run docs:pdf $(DOCS)
	npm run docs:package $(DOCS)
