FROM node:20-alpine

WORKDIR /workspace

COPY services/planner/package.json services/planner/package-lock.json ./services/planner/

WORKDIR /workspace/services/planner
RUN npm ci --omit=dev

WORKDIR /workspace
COPY lib/plannerContract.ts ./lib/plannerContract.ts
COPY services/planner ./services/planner

WORKDIR /workspace/services/planner

EXPOSE 4000
ENV VILLAGESIM_PLANNER_SERVICE_PORT=4000

CMD ["node", "--import", "tsx", "src/server.ts"]
