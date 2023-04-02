import { PlistParseError, getStringFromDict, getStringFromNestedDict, getFloatFromNestedDict } from '../util/plist';

interface CollaborationMessage {
    original_url?: string;
    url?: string;
    title?: string;
    creation_date?: number;
    bundle_id?: string;
    app_name?: string;
}

export class CollaborationMessageImpl implements CollaborationMessage {
    constructor(
        public original_url?: string,
        public url?: string,
        public title?: string,
        public creation_date?: number,
        public bundle_id?: string,
        public app_name?: string,
    ) {}

    static fromMap(payload: any): CollaborationMessageImpl | undefined {
        try {
            const [meta, base] = CollaborationMessageImpl.getMetaAndSpecialization(payload);
            return new CollaborationMessageImpl(
                getStringFromNestedDict(base, 'originalURL'),
                getStringFromDict(meta, 'collaborationIdentifier'),
                getStringFromDict(meta, 'title'),
                getFloatFromNestedDict(meta, 'creationDate'),
                CollaborationMessageImpl.getBundleId(meta),
                CollaborationMessageImpl.getAppName(base),
            );
        } catch (e) {
            if (e instanceof PlistParseError) {
                return undefined;
            }
            throw e;
        }
    }

    private static getMetaAndSpecialization(payload: any): [any, any] {
        const base = payload["richLinkMetadata"];
        if (!base) throw new PlistParseError("Missing key 'richLinkMetadata'");

        const meta = base["collaborationMetadata"];
        if (!meta) throw new PlistParseError("Missing key 'collaborationMetadata'");

        return [meta, base];
    }

    private static getBundleId(payload: any): string | undefined {
        return payload?.["containerSetupInfo"]?.["containerID"]?.["ContainerIdentifier"];
    }

    private static getAppName(payload: any): string | undefined {
        return payload?.["specialization2"]?.["specialization"]?.["application"];
    }

    getUrl(): string | undefined {
        return this.url || this.original_url;
    }
}

// Tests
const testData: any = {
    "richLinkMetadata": {
        "collaborationMetadata": {
            "collaborationIdentifier": "https://www.icloud.com/freeform/REDACTED",
            "containerSetupInfo": {
                "containerID": {
                    "ContainerIdentifier": "com.apple.freeform",
                }
            },
            "creationDate": 695179243.070923,
            "title": "Untitled",
        },
        "originalURL": "https://www.icloud.com/freeform/REDACTED#Untitled",
        "specialization2": {
            "specialization": {
                "application": "Freeform",
            },
        },
    },
};

const parsed = CollaborationMessageImpl.fromMap(testData);
const expected = new CollaborationMessageImpl(
    "https://www.icloud.com/freeform/REDACTED#Untitled",
    "https://www.icloud.com/freeform/REDACTED",
    "Untitled",
    695179243.070923,
    "com.apple.freeform",
    "Freeform",
);

if (!parsed || JSON.stringify(parsed) !== JSON.stringify(expected)) {
    console.error('Test failed');
}