import test from "node:test";
import assert from "node:assert/strict";
import { CAPTURE_PURPOSES, canAddPhoto, capturePath, extensionFor, saveBlock, setPhotoState, type CapturePhoto } from "./capture.ts";

const photo = (id: string, state: CapturePhoto["state"]): CapturePhoto => ({ id, name: `${id}.jpg`, state, path: `p/${id}` });

test("paths put company, user and capture first, which is what the bucket rules read", () => {
  const p = capturePath({ companyId: "c1", userId: "u1", captureId: "k1", photoId: "p1", name: "IMG_01.JPEG" });
  assert.equal(p, "c1/u1/k1/p1.jpg");
});

test("extension falls back to the mime type, then jpg", () => {
  assert.equal(extensionFor("photo", "image/png"), "png");
  assert.equal(extensionFor("photo", ""), "jpg");
  assert.equal(extensionFor("a.heic", null), "heic");
});

test("each purpose caps its photos", () => {
  const four = [1, 2, 3, 4].map((i) => photo(String(i), "done"));
  assert.equal(canAddPhoto("fuel_receipt", four), false);
  assert.equal(canAddPhoto("document", four), true);
  assert.ok(CAPTURE_PURPOSES.document.maxPhotos > CAPTURE_PURPOSES.fuel_receipt.maxPhotos);
});

test("Save is blocked until every photo is up", () => {
  assert.equal(saveBlock([]), "Take at least one photo.");
  assert.equal(saveBlock([photo("a", "done"), photo("b", "uploading")]), "Still uploading.");
  assert.match(saveBlock([photo("a", "failed")]) ?? "", /didn't upload/);
  assert.equal(saveBlock([photo("a", "done")]), null);
});

test("a retry moves a failed photo back through uploading to done", () => {
  let list = [photo("a", "failed")];
  list = setPhotoState(list, "a", "uploading");
  assert.equal(list[0].state, "uploading");
  list = setPhotoState(list, "a", "done");
  assert.equal(saveBlock(list), null);
});
