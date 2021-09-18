FROM node:latest

WORKDIR /usr/src/app

COPY package.json ./

RUN yarn install

COPY . .

RUN mkdir -p /usr/src/app/logs

EXPOSE 3000
CMD [ "node", "src/index.js" ]