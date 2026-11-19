import { humanizeType, labelForGoogleTypes, poiCategoryOf } from "../placeCategory";

describe("a place's category from Google's types", () => {
  it("labels the most specific type", () => {
    expect(labelForGoogleTypes(["shopping_mall", "point_of_interest", "establishment"])).toBe("Shopping mall");
    expect(labelForGoogleTypes(["point_of_interest", "restaurant", "food"])).toBe("Restaurant");
    expect(labelForGoogleTypes(["street_address"])).toBe("Address");
    expect(labelForGoogleTypes(["route", "political"])).toBe("Address");
    expect(labelForGoogleTypes(["point_of_interest", "establishment"])).toBe("Place");
    expect(labelForGoogleTypes(undefined)).toBe("");
  });

  it("picks the badge from the types", () => {
    expect(poiCategoryOf("", ["shopping_mall", "point_of_interest"])).toBe("mall");
    expect(poiCategoryOf("", ["night_club", "bar"])).toBe("nightlife");
    expect(poiCategoryOf("", ["clothing_store", "store"])).toBe("shopping");
    expect(poiCategoryOf("", ["local_government_office"])).toBe("government");
  });

  it("gives addresses, stations and unknown places a plain pin, not the Services briefcase", () => {
    expect(poiCategoryOf("")).toBeNull();
    expect(poiCategoryOf(null)).toBeNull();
    expect(poiCategoryOf("Address")).toBeNull();
    expect(poiCategoryOf("Place")).toBeNull();
    expect(poiCategoryOf("Bus station")).toBeNull();
    expect(poiCategoryOf("", ["train_station", "transit_station"])).toBeNull();
  });

  it("reads our own labels and humanized Google types", () => {
    expect(poiCategoryOf("Food")).toBe("food");
    expect(poiCategoryOf("Parks & nature")).toBe("park");
    expect(poiCategoryOf("Shopping mall")).toBe("mall");
    expect(poiCategoryOf("Gas station")).toBe("fuel");
    expect(poiCategoryOf("Services")).toBe("services");
  });

  it("guesses from words without false matches", () => {
    expect(poiCategoryOf("Theatre")).toBe("entertainment");
    expect(poiCategoryOf("Barber shop")).not.toBe("nightlife");
    expect(poiCategoryOf("Cocktail bar")).toBe("nightlife");
    expect(poiCategoryOf("Steakhouse grill")).toBe("food");
  });

  it("humanizes types", () => {
    expect(humanizeType("gas_station")).toBe("Gas station");
    expect(humanizeType("")).toBe("");
  });
});
