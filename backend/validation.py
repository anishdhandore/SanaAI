"""
Validation logic to detect hallucinated content in rewritten resumes
"""

import re
from typing import List, Dict


def extract_skills_from_resume(resume: str) -> List[str]:
    """
    Extract skills mentioned in resume
    TODO: Improve skill extraction with better NLP or comprehensive skill database
    """
    # Common technical skills patterns
    # TODO: Expand this list or use a skills database
    skills_pattern = r'\b(?:Python|Java|JavaScript|TypeScript|React|Node\.js|SQL|AWS|Docker|Kubernetes|Git|Linux|HTML|CSS|Machine Learning|AI|Data Science|TensorFlow|PyTorch|C\+\+|C#|Go|Rust|PHP|Ruby|Swift|Kotlin|Angular|Vue|Django|Flask|FastAPI|Spring|Express|MongoDB|PostgreSQL|MySQL|Redis|Elasticsearch|GraphQL|REST|API|Microservices|DevOps|CI/CD|Jenkins|GitLab|GitHub|Agile|Scrum|JIRA|Confluence|Tableau|Power BI|Excel|Pandas|NumPy|Scikit-learn|NLP|Computer Vision|Deep Learning|Neural Networks|Statistics|Mathematics|Algorithms|Data Structures|Object-Oriented Programming|Functional Programming|Test-Driven Development|Unit Testing|Integration Testing|System Design|Architecture|Cloud Computing|Azure|GCP|Kubernetes|Terraform|Ansible|Chef|Puppet|Monitoring|Logging|Debugging|Performance Optimization|Security|Authentication|Authorization|Encryption|SSL|TLS|HTTPS|OAuth|JWT|GraphQL|RESTful APIs|Microservices|Serverless|Lambda|S3|EC2|RDS|DynamoDB|ElastiCache|CloudFront|Route53|VPC|IAM|SNS|SQS|Kinesis|Redshift|EMR|SageMaker|Comprehend|Rekognition|Polly|Lex|Alexa|Google Assistant|Siri|Natural Language Processing|Speech Recognition|Computer Vision|Image Processing|Video Processing|Audio Processing|Signal Processing|Data Mining|Data Warehousing|ETL|Data Pipeline|Data Lake|Data Warehouse|Business Intelligence|Analytics|Reporting|Dashboard|Visualization|Data Modeling|Database Design|Normalization|Indexing|Query Optimization|Transaction Management|ACID|CAP Theorem|Distributed Systems|Load Balancing|Caching|CDN|Message Queue|Event Streaming|Pub/Sub|WebSocket|gRPC|GraphQL|REST|SOAP|XML|JSON|YAML|Protobuf|Avro|Parquet|ORC|CSV|TSV|JSON Lines|Avro|Protocol Buffers|MessagePack|BSON|HDF5|NetCDF|Zarr|Arrow|Feather|Pickle|Joblib|H5py|Zarr|Xarray|Dask|Ray|Spark|Hadoop|MapReduce|Hive|Pig|Impala|Presto|Trino|Drill|Kylin|Druid|Pinot|ClickHouse|TimescaleDB|InfluxDB|Prometheus|Grafana|Kibana|Elasticsearch|Solr|Lucene|Whoosh|Sphinx|Xapian|Meilisearch|Typesense|Algolia|MongoDB|Cassandra|CouchDB|Riak|Neo4j|ArangoDB|OrientDB|JanusGraph|Dgraph|TigerGraph|Redis|Memcached|Hazelcast|Ignite|Coherence|GemFire|Terracotta|Ehcache|Caffeine|Guava Cache|Spring Cache|Hibernate|JPA|SQLAlchemy|Django ORM|ActiveRecord|Sequelize|TypeORM|Prisma|Mongoose|Motor|PyMongo|MongoEngine|MongoKit|MongoDB Compass|Robo 3T|Studio 3T|MongoDB Atlas|MongoDB Cloud|MongoDB Realm|MongoDB Stitch|MongoDB Charts|MongoDB Connector|MongoDB Spark Connector|MongoDB Kafka Connector|MongoDB BI Connector|MongoDB Connector for BI|MongoDB Connector for Apache Spark|MongoDB Connector for Apache Kafka|MongoDB Connector for Apache Flink|MongoDB Connector for Apache Storm|MongoDB Connector for Apache Samza|MongoDB Connector for Apache Beam|MongoDB Connector for Apache NiFi|MongoDB Connector for Apache Airflow|MongoDB Connector for Apache Superset|MongoDB Connector for Tableau|MongoDB Connector for Power BI|MongoDB Connector for Qlik|MongoDB Connector for Looker|MongoDB Connector for Metabase|MongoDB Connector for Redash|MongoDB Connector for Grafana|MongoDB Connector for Kibana|MongoDB Connector for Elasticsearch|MongoDB Connector for Solr|MongoDB Connector for Lucene|MongoDB Connector for Whoosh|MongoDB Connector for Sphinx|MongoDB Connector for Xapian|MongoDB Connector for Meilisearch|MongoDB Connector for Typesense|MongoDB Connector for Algolia)\b'
    
    skills = re.findall(skills_pattern, resume, re.IGNORECASE)
    return list(set([s.lower() for s in skills]))


def extract_companies_from_resume(resume: str) -> List[str]:
    """
    Extract company names from resume
    TODO: Improve company extraction with better NLP or pattern matching
    Look for patterns like:
    - "Company Name |"
    - "at Company Name"
    - "Company Name -"
    - Experience section headers
    """
    lines = resume.split('\n')
    companies = []
    
    # Common patterns for company names in resumes
    patterns = [
        r'at\s+([A-Z][a-zA-Z\s&]+)',  # "at Company Name"
        r'([A-Z][a-zA-Z\s&]+)\s*\|',  # "Company Name |"
        r'([A-Z][a-zA-Z\s&]+)\s*-\s*',  # "Company Name -"
        r'([A-Z][a-zA-Z\s&]+)\s*\(',  # "Company Name ("
    ]
    
    for line in lines:
        for pattern in patterns:
            matches = re.findall(pattern, line)
            companies.extend(matches)
    
    # Clean up company names
    companies = [c.strip() for c in companies if len(c.strip()) > 2]
    return list(set(companies))


def extract_dates_from_resume(resume: str) -> List[str]:
    """
    Extract dates from resume
    Returns list of date strings found in the resume
    """
    date_patterns = [
        r'\d{1,2}[/-]\d{4}',  # MM/YYYY or MM-YYYY
        r'\d{4}[/-]\d{1,2}',  # YYYY/MM or YYYY-MM
        r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}',  # Month YYYY
        r'\d{4}',  # Just year
    ]
    
    dates = []
    for pattern in date_patterns:
        matches = re.findall(pattern, resume, re.IGNORECASE)
        dates.extend(matches)
    
    return list(set(dates))


def extract_job_titles_from_resume(resume: str) -> List[str]:
    """
    Extract job titles from resume
    TODO: Improve title extraction with better patterns
    """
    # Common patterns for job titles
    patterns = [
        r'(?:Software|Senior|Junior|Lead|Principal|Staff|Senior Staff|Distinguished)?\s*(?:Engineer|Developer|Programmer|Architect|Manager|Director|Analyst|Scientist|Consultant|Specialist|Coordinator|Associate|Assistant|Executive|Officer|Representative|Administrator|Technician|Designer|Writer|Editor|Producer|Coordinator|Supervisor|Superintendent|Vice President|President|CEO|CTO|CFO|COO|CMO|VP|SVP|EVP|Head of|Chief)\s*(?:of|in)?\s*[A-Za-z\s&]+',
    ]
    
    titles = []
    for pattern in patterns:
        matches = re.findall(pattern, resume, re.IGNORECASE)
        titles.extend(matches)
    
    return list(set([t.strip() for t in titles if len(t.strip()) > 3]))


def validate_resume_changes(
    original_resume: str,
    rewritten_resume: str,
    original_skills: List[str] = None,
    original_companies: List[str] = None,
    original_dates: List[str] = None,
    original_titles: List[str] = None
) -> Dict:
    """
    Validate that rewritten resume doesn't contain hallucinated content
    
    Returns:
        {
            "passed": bool,
            "changes": List[str],
            "warnings": List[str],
            "errors": List[str]
        }
    """
    if original_skills is None:
        original_skills = extract_skills_from_resume(original_resume)
    if original_companies is None:
        original_companies = extract_companies_from_resume(original_resume)
    if original_dates is None:
        original_dates = extract_dates_from_resume(original_resume)
    if original_titles is None:
        original_titles = extract_job_titles_from_resume(original_resume)
    
    changes = []
    warnings = []
    errors = []
    passed = True
    
    # Check for new skills
    rewritten_skills = extract_skills_from_resume(rewritten_resume)
    new_skills = [s for s in rewritten_skills if s not in original_skills]
    if new_skills:
        error_msg = f"ERROR: New skills detected that were not in original resume: {', '.join(new_skills[:5])}"
        errors.append(error_msg)
        changes.append(error_msg)
        passed = False
    
    # Check for new companies
    rewritten_companies = extract_companies_from_resume(rewritten_resume)
    new_companies = [c for c in rewritten_companies if c not in original_companies and len(c) > 2]
    if new_companies:
        error_msg = f"ERROR: New companies detected that were not in original resume: {', '.join(new_companies[:5])}"
        errors.append(error_msg)
        changes.append(error_msg)
        passed = False
    
    # Check for missing dates
    rewritten_dates = extract_dates_from_resume(rewritten_resume)
    missing_dates = [d for d in original_dates if d not in rewritten_resume]
    if missing_dates:
        warning_msg = f"WARNING: Some original dates may be missing: {', '.join(missing_dates[:3])}"
        warnings.append(warning_msg)
        changes.append(warning_msg)
    
    # Check for new job titles
    rewritten_titles = extract_job_titles_from_resume(rewritten_resume)
    new_titles = [t for t in rewritten_titles if t.lower() not in [ot.lower() for ot in original_titles]]
    if new_titles:
        error_msg = f"ERROR: New job titles detected: {', '.join(new_titles[:3])}"
        errors.append(error_msg)
        changes.append(error_msg)
        passed = False
    
    if passed and not errors:
        changes.append("✓ Validation passed: No unauthorized changes detected")
    
    return {
        "passed": passed,
        "changes": changes,
        "warnings": warnings,
        "errors": errors
    }
