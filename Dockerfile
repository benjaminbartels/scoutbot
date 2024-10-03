FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --production && npm install typescript ts-node

COPY . .

CMD ["npx", "ts-node", "src/index.ts"]