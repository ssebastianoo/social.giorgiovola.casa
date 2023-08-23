FROM node:20.5.1-bullseye

WORKDIR /app

COPY package.json /app

RUN apt-get update

RUN apt-get -y install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

RUN npm install

RUN echo "VERSION=$(git rev-parse --short HEAD)" >> /app/.env

COPY . /app

CMD ["bash", "build-container.sh"]
