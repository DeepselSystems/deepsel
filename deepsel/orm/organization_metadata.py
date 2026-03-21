from sqlalchemy import Column, Integer, ForeignKey


class OrganizationMetaDataMixin(object):
    # owner_id is the id of the user who created the record
    owner_id = Column(Integer, ForeignKey("user.id"))
    organization_id = Column(Integer, ForeignKey("organization.id"), nullable=False)
