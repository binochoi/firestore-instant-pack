import { Firestore } from '@google-cloud/firestore';

type WhereFilterOperator =
  | '<'
  | '<='
  | '=='
  | '!='
  | '>='
  | '>'
  | 'array-contains'
  | 'in'
  | 'not-in'
  | 'array-contains-any';
type WhereCondition = [string, WhereFilterOperator, string];
type Object = {[K: string]: any};
const transformSingularWhereConditionToPlural = (conditions: WhereCondition | WhereCondition[]): WhereCondition[] => {
  if(typeof conditions[0] === 'string') {
    return [conditions] as WhereCondition[];
  }
  return conditions as WhereCondition[];
};
let store: Firestore;
export const getFirestoreInstance = () => store;
export const config = (settings: ConstructorParameters<typeof Firestore>[0]) => {
  store = new Firestore(settings);
  return store;
};

  /** firestore cannot store undefined value */
const modifyUndefToNullOfProperties = (_obj: Object) => {
  const obj = {..._obj};
  for (const propKey in obj) {
    if (obj[propKey] == undefined) {
      obj[propKey] = null;
    };
  }
  return obj;
}

const defaultPageCount = 25;
export const getPage = async (
  collectionName: string,
  options: {
    pageIndex: number;
    count?: number;
    where?: [string, WhereFilterOperator, string | number];
    orderBy?: 'asc' | 'desc';
  },
) => {
  if (!options.count) options.count = defaultPageCount;
  const { pageIndex, count } = options;
  const offset = (pageIndex - 1) * count;
  const collection = store.collection(collectionName);
  let query = await collection.offset(offset).limit(count);
  if (options.where) {
    query = query.where(...options.where);
  } else {
    query = query.orderBy('at_created', options.orderBy || 'desc');
  }
  const documents = await query.get();

  const returnArray: any[] = [];
  documents.forEach((doc) =>
    returnArray.push({
      documentId: doc.id,
      ...doc.data(),
    }),
  );
  return returnArray;
}
/** select just specific documents */
export const getSpecifics = async (collectionName: string, _docs: string[] | string = []) => {
  const docs = Array.isArray(_docs) ? _docs : [_docs];
  const likeListPageLimit = 25;
  const collection = store.collection(collectionName);

  const returnArray: any[] = [];
  const limit =
    docs.length > likeListPageLimit ? likeListPageLimit : docs.length;
  for (let i = 0; i < limit; i++) {
    const docId = docs[i];
    if (docId === undefined) {
      continue;
    }
    const doc = await collection.doc(docId).get();
    if (doc.exists) {
      returnArray.push({
        documentId: doc.id,
        ...doc.data(),
      });
    }
  }
  return returnArray;
}

const getDocument = async (collectionName: string, _conditions?: WhereCondition | WhereCondition[]) => {
  const conditions = _conditions && transformSingularWhereConditionToPlural(_conditions);
  const collection = store.collection(collectionName);
  conditions?.map((condition) => {
    collection.where(...condition);
  })
  const { docs } = await collection.get();
  return docs[0];
}
export const getOne = async (collectionName: string, conditions?: WhereCondition | WhereCondition[]) => {
  const docs = await getDocument(collectionName, conditions);
  const documentId = docs.id;
  return { documentId, ...docs.data() }
}

export const isExistDoc = async (
  collectionName: string,
  conditions?: WhereCondition | WhereCondition[],
): Promise<boolean> => {
  const { exists } = await getDocument(collectionName, conditions);
  return exists;
}

export const insertOne = async (collection: string, obj: Object): Promise<string> => {
  const batch = store.batch();
  const doc = modifyUndefToNullOfProperties(obj);
  const req = await store.collection(collection).add(doc);
  await batch.commit();
  const documentId = req.id;
  return documentId;
}

export const setOne = async (collection: string, docId: string, obj: Object) => {
  return await store.collection(collection).doc(docId).set(modifyUndefToNullOfProperties(obj));
}

/** move collection to another document */
export const move = async ({
  from: originCollectionName,
  to: remoteCollectionName,
  documentId,
}: {
  from: string;
  to: string;
  documentId: string;
}) => {
  const collection = store.collection(originCollectionName);
  const document = await collection.doc(documentId);
  const snapshot = await collection.doc(documentId).get();
  const batch = store.batch();
  const _data = snapshot.data();
  if (_data === undefined) {
    throw new Error('not exist document');
  }
  const data = modifyUndefToNullOfProperties(_data);
  store.collection(remoteCollectionName).add(data);
  store.collection(originCollectionName).doc(document.id).delete();
  await batch.commit();
}
export const removeOne = async (collectionName: string, documentId: string) => {
  const collection = store.collection(collectionName);
  const document = collection.doc(documentId);
  await document.delete();
}