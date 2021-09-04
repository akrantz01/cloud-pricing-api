import axios from "axios";
import fs from "fs";
import config from "../config";
import { Product, Price } from '../db/types';
import { generateProductHash, generatePriceHash } from '../db/helpers';
import { upsertProducts } from '../db/upsert';

const baseUrl = 'https://api.digitalocean.com/v2';

type InstanceResponse = {
  // eslint-disable-next-line camelcase
  instance_sizes: Array<Instance>
}

type Instance = {
  name: string,
  slug: string
  // eslint-disable-next-line camelcase
  tier_slug: string,
  // eslint-disable-next-line camelcase
  usd_per_month: string,
  // eslint-disable-next-line camelcase
  usd_per_second: string,
  // eslint-disable-next-line camelcase
  memory_bytes: string,
  cpus: string
  // eslint-disable-next-line camelcase
  cpu_type: string,
}

type RegionsResponse = {
  regions: Array<Region>
}

type Region = {
  // eslint-disable-next-line camelcase
  data_centers: Array<string>
}

async function downloadJson(path: string) {
  const url = `${baseUrl}${path}`;
  const segments = path.split('/');
  const data = segments[segments.length - 1];

  config.logger.info(`Downloading ${url}`);

  const response = await axios({
    method: 'get',
    url,
    responseType: 'stream',
    headers: {
      Authorization: `Bearer ${config.digitalOceanToken}`,
    },
  });
  const writer = fs.createWriteStream(`data/digitalocean-apps-${data}.json`);
  response.data.pipe(writer);
  await new Promise(resolve => writer.on('finish', resolve));
}

function generateProduct(instance: Instance): Product {
  return {
    productHash: '',
    vendorName: 'digitalocean',
    service: 'Apps',
    productFamily: instance.tier_slug,
    region: '',
    sku: instance.slug,
    attributes: {
      cpus: instance.cpus,
      cpuType: instance.cpu_type,
      memory: (parseInt(instance.memory_bytes, 10) / 1024 / 1024).toString(),
    },
    prices: [],
  };
}

function generatePrice(unit: 'hourly' | 'monthly', instance: Instance, product: Product): Price {
  const cost = unit === 'hourly' ? parseFloat(instance.usd_per_second) * 60 * 60 : parseFloat(instance.usd_per_month);
  const price = {
    priceHash: '',
    unit,
    USD: cost.toString(),
    purchaseOption: '',
    effectiveDateStart: '',
  };
  price.priceHash = generatePriceHash(product, price);
  return price;
}

async function processApps() {
  const regionsContent = fs.readFileSync('data/digitalocean-apps-regions.json');
  const { regions: regionGroups } = <RegionsResponse>JSON.parse(regionsContent.toString());
  const regions = regionGroups.flatMap(group => group.data_centers);
  config.logger.info(`Got ${regions.length} regions in ${regionGroups.length} groups`);

  const instancesContent = fs.readFileSync('data/digitalocean-apps-instance_sizes.json');
  const { instance_sizes: instances } = <InstanceResponse>JSON.parse(instancesContent.toString());
  config.logger.info(`Got ${instances.length} instance types`);

  const products = instances.flatMap(instance => {
    return regions.map(region => {
      const product = generateProduct(instance);

      product.region = region;
      product.productHash = generateProductHash(product);
      product.prices = [
        generatePrice('hourly', instance, product),
        generatePrice('monthly', instance, product),
      ];

      return product;
    });
  });

  config.logger.info(`Added ${products.length} products`);
  await upsertProducts(products);
}

async function scrape(): Promise<void> {
  await downloadJson('/apps/regions');
  await downloadJson('/apps/tiers/instance_sizes');
  await processApps();
}

export default {
  scrape,
};
