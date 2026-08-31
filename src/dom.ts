const missingElement = (selector: string): never => {
    throw new Error(`Required element not found: ${selector}`);
};

export const queryElement = <ElementType extends Element>(
    selector: string,
    parent: ParentNode = document,
): ElementType =>
    parent.querySelector<ElementType>(selector) ?? missingElement(selector);
