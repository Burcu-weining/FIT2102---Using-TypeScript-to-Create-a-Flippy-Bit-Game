/*
The dom file handles finding required HTML or SVG elements on the webpage 
in a reusable and type-safe way.
*/

/*
This function is used when an expected webpage element cannot be found
*/
const missingElement = (selector: string): never => {
    throw new Error(`Required element not found: ${selector}`);
};

/*
A generic function, ElementType represents the particular kind of element we
expect to find
ElementType extends Element -> means the supplied type must be a valid browser
element type. It prevents unrelated types such as number or state from being
used.
*/
export const queryElement = <ElementType extends Element>(
    selector: string,
    parent: ParentNode = document,
): ElementType =>
    parent.querySelector<ElementType>(selector) ?? missingElement(selector);
