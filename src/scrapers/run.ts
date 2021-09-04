import yargs from 'yargs';
import config from '../config';
import awsBulk from './awsBulk';
import awsSpot from './awsSpot';
import azureRetail from './azureRetail';
import digitaloceanApps from './digitaloceanApps';
import digitaloceanDroplets from './digitaloceanDroplets';
import gcpCatalog from './gcpCatalog';
import gcpMachineTypes from './gcpMachineTypes';

interface ScraperConfig {
  vendor: string;
  source: string;
  scraperFunc: () => void;
}

const Scrapers = {
  aws: {
    bulk: awsBulk.scrape,
    spot: awsSpot.scrape,
  },
  azure: {
    retail: azureRetail.scrape,
  },
  digitalocean: {
    apps: digitaloceanApps.scrape,
    droplets: digitaloceanDroplets.scrape,
  },
  gcp: {
    catalog: gcpCatalog.scrape,
    machineTypes: gcpMachineTypes.scrape,
  },
};

async function run(): Promise<void> {
  const { argv } = yargs
    .usage(
      'Usage: $0 --only=[aws:bulk,aws:spot,azure:retail,digitalocean:apps,digitalocean:droplets,gcp:catalog,gcp:machineTypes]'
    )
    .options({
      only: { type: 'string' },
    });

  const scraperConfigs: ScraperConfig[] = [];

  Object.entries(Scrapers).forEach((scraperEntry) => {
    const [vendor, vendorScrapers] = scraperEntry;
    Object.entries(vendorScrapers).forEach((vendorScraperEntry) => {
      const [source, scraperFunc] = vendorScraperEntry;

      if (
        !argv.only ||
        (argv.only && argv.only.split(',').includes(`${vendor}:${source}`))
      ) {
        scraperConfigs.push({
          vendor,
          source,
          scraperFunc,
        });
      }
    });
  });

  for (const scraperConfig of scraperConfigs) {
    config.logger.info(
      `Running update function for ${scraperConfig.vendor}:${scraperConfig.source}`
    );
    await scraperConfig.scraperFunc();
  }
}

export default {
  run,
};
