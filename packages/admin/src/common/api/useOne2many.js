import useModel from './useModel.jsx';
import { useState } from 'react';

export default function useOne2many({
  parentRecord: initialParentRecord,
  childModel,
  relationshipName,
  foreignKeyField,
}) {
  const {
    create: createChild,
    update: updateChild,
    del: deleteChild,
    loading,
    error,
  } = useModel(childModel);

  const [parentRecord, setParentRecord] = useState(initialParentRecord);

  async function create(newRecords, parentRecord = parentRecord) {
    return Promise.all(
      newRecords.map((record) =>
        createChild({
          ...record,
          [foreignKeyField]: parentRecord.id,
        }),
      ),
    );
  }

  async function update(newRecords, parent = parentRecord) {
    const oldRecords = parent[relationshipName];
    const oldRecordIds = oldRecords.map((record) => record.id);
    const newRecordIds = newRecords.map((record) => record.id);

    const recordsToAdd = newRecords.filter(
      (record) => !record.id || !oldRecordIds.includes(record.id),
    );
    const recordsToRemove = oldRecords.filter((record) => !newRecordIds.includes(record.id));
    const recordsToUpdate = newRecords.filter((record) => record.id);

    const created = Promise.all(
      recordsToAdd.map((record) =>
        createChild({
          ...record,
          [foreignKeyField]: parent.id,
        }),
      ),
    );
    const updated = Promise.all(
      recordsToUpdate.map((record) =>
        updateChild({
          ...record,
          [foreignKeyField]: parent.id,
        }),
      ),
    );
    const deleted = Promise.all(recordsToRemove.map((record) => deleteChild(record.id)));

    return Promise.all([created, updated, deleted]);
  }

  return {
    create,
    update,
    loading,
    error,
    parentRecord,
    setParentRecord,
  };
}
