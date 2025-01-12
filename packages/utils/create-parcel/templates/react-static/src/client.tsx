"use client-entry";

import {useState, use, startTransition, useInsertionEffect, ReactElement} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {createFromReadableStream, createFromFetch} from 'react-server-dom-parcel/client';
import {rscStream} from 'rsc-html-stream/client';

// Stream in initial RSC payload embedded in the HTML.
let initialRSCPayload = createFromReadableStream<ReactElement>(rscStream);
let updateRoot: ((root: ReactElement, cb?: () => void) => void) | null = null;

function Content() {
  // Store the current root element in state, along with a callback
  // to call once rendering is complete.
  let [[root, cb], setRoot] = useState<[ReactElement, (() => void) | null]>([use(initialRSCPayload), null]);
  updateRoot = (root, cb) => setRoot([root, cb ?? null]);
  useInsertionEffect(() => cb?.());
  return root;
}

// Hydrate initial page content.
startTransition(() => {
  hydrateRoot(document, <Content />);
});

// A very simple router. When we navigate, we'll fetch a new RSC payload,
// and in a React transition, stream in the new page. Once complete, we'll
// pushState to update the URL in the browser.
async function navigate(pathname: string, push = false) {
  let res = fetch(pathname.replace(/\.html$/, '.rsc'));
  let root = await createFromFetch<ReactElement>(res);
  startTransition(() => {
    updateRoot!(root, () => {
      if (push) {
        history.pushState(null, '', pathname);
        push = false;
      }
    });
  });
}

// Intercept link clicks to perform RSC navigation.
document.addEventListener('click', e => {
  let link = (e.target as Element).closest('a');
  if (
    link &&
    link instanceof HTMLAnchorElement &&
    link.href &&
    (!link.target || link.target === '_self') &&
    link.origin === location.origin &&
    !link.hasAttribute('download') &&
    e.button === 0 && // left clicks only
    !e.metaKey && // open in new tab (mac)
    !e.ctrlKey && // open in new tab (windows)
    !e.altKey && // download
    !e.shiftKey &&
    !e.defaultPrevented
  ) {
    e.preventDefault();
    navigate(link.pathname, true);
  }
});

// When the user clicks the back button, navigate with RSC.
window.addEventListener('popstate', e => {
  navigate(location.pathname);
});

// Intercept HMR window reloads, and do it with RSC instead.
window.addEventListener('parcelhmrreload', e => {
  e.preventDefault();
  navigate(location.pathname);
});