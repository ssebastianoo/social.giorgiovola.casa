FROM node:20.5.1-buster

WORKDIR /app

COPY package.json /app

RUN npm install

RUN echo "VERSION=$(git rev-parse --short HEAD)" >> /app/.env

COPY . /app

CMD ["bash", "build-container.sh"]