// @flow strict-local
import {Bundler} from '@parcel/plugin';
import nullthrows from 'nullthrows';

// This bundler plugin is designed specifically for library builds. It outputs a bundle for
// each input asset, which ensures that the library can be effectively tree shaken and code
// split by an application bundler.
export default (new Bundler({
  bundle({bundleGraph}) {
    // Collect dependencies from the graph.
    // We do not want to mutate the graph while traversing, so this must be done first.
    let dependencies = [];
    let entryDeps = [];
    bundleGraph.traverse((node, context) => {
      if (node.type === 'dependency') {
        let dependency = node.value;
        if (bundleGraph.isDependencySkipped(dependency)) {
          return;
        }
        let assets = bundleGraph.getDependencyAssets(dependency);
        dependencies.push([
          dependency,
          nullthrows(dependency.target ?? context),
          assets,
        ]);
        if (dependency.target) {
          entryDeps.push(dependency);
          return dependency.target;
        }
      }
    });

    let bundleGroupsByTarget = new Map();
    for (let dep of entryDeps) {
      let target = nullthrows(dep.target);
      let bundleGroup = bundleGraph.createBundleGroup(dep, target);
      bundleGroupsByTarget.set(target, bundleGroup);
    }

    // Create bundles for each asset.
    let bundles = new Map();
    for (let [dependency, target, assets] of dependencies) {
      if (assets.length === 0) {
        continue;
      }

      let parentAsset = bundleGraph.getAssetWithDependency(dependency);
      let parentBundle;
      if (parentAsset) {
        let parentKey = getBundleKey(parentAsset, target);
        parentBundle = bundles.get(parentKey);
      }

      // Create a separate bundle group/bundle for each asset.
      for (let asset of assets) {
        let key = getBundleKey(asset, target);
        let bundle = bundles.get(key);
        if (!bundle) {
          let bundleGroup = nullthrows(bundleGroupsByTarget.get(target));
          bundle = bundleGraph.createBundle({
            entryAsset: asset,
            needsStableName: dependency.isEntry,
            target,
            bundleBehavior: dependency.bundleBehavior ?? asset.bundleBehavior,
          });
          bundleGraph.addBundleToBundleGroup(bundle, bundleGroup);
          bundles.set(key, bundle);
        }

        if (!bundle.hasAsset(asset)) {
          bundleGraph.addAssetToBundle(asset, bundle);
        }

        // Reference the parent bundle so we create dependencies between them.
        if (parentBundle && parentBundle !== bundle) {
          bundleGraph.createBundleReference(parentBundle, bundle);
          bundleGraph.createAssetReference(dependency, asset, bundle);
        }
      }
    }
  },
  optimize() {},
}): Bundler);

function getBundleKey(asset, target) {
  // Group by type and file path so CSS generated by macros is combined together by parent JS file.
  // Also group by environment/target to ensure bundles cannot be shared between packages.
  return `${asset.type}:${asset.filePath}:${asset.env.id}:${
    target.loc?.filePath ?? target.distDir
  }`;
}
